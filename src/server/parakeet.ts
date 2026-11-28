import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client, Metadata, credentials, status } from "@grpc/grpc-js";
import protobuf from "protobufjs";
import type { ParakeetModel } from "../lib/transcription-models.ts";
import { convertToOpus } from "./audio.ts";
import { HttpError } from "./http.ts";

// Hosted offline Riva endpoints listed in NVIDIA's Parakeet API docs.
const FUNCTION_IDS: Record<ParakeetModel, string> = {
  "parakeet-tdt-0.6b-v2": "d3fe9151-442b-4204-a70d-5fcc597fd610",
  "parakeet-ctc-1.1b-asr": "1598d209-5e27-4d3c-8079-4751568b1081",
};

// The subset of NVIDIA Riva's ASR protocol used by both models.
const { root } = protobuf.parse(`
  syntax = "proto3";
  package nvidia.riva.asr;
  message RecognitionConfig {
    enum AudioEncoding { ENCODING_UNSPECIFIED = 0; OGGOPUS = 4; }
    AudioEncoding encoding = 1;
    int32 sample_rate_hertz = 2;
    string language_code = 3;
    int32 max_alternatives = 4;
    int32 audio_channel_count = 7;
    bool enable_automatic_punctuation = 11;
  }
  message RecognizeRequest {
    RecognitionConfig config = 1;
    bytes audio = 2;
  }
  message RecognizeResponse {
    repeated SpeechRecognitionResult results = 1;
  }
  message SpeechRecognitionResult {
    repeated SpeechRecognitionAlternative alternatives = 1;
  }
  message SpeechRecognitionAlternative {
    string transcript = 1;
  }
`);
const requestType = root.lookupType("nvidia.riva.asr.RecognizeRequest");
const responseType = root.lookupType("nvidia.riva.asr.RecognizeResponse");
const client = new Client("grpc.nvcf.nvidia.com:443", credentials.createSsl());

interface RecognitionResponse {
  results: Array<{ alternatives: Array<{ transcript: string }> }>;
}

function recognitionError(code: status): HttpError {
  switch (code) {
    case status.UNAUTHENTICATED:
    case status.PERMISSION_DENIED:
      return new HttpError(502, "provider_auth", "NVIDIA rejected the request. Check NVIDIA_API_KEY and its Parakeet access.");
    case status.RESOURCE_EXHAUSTED:
      return new HttpError(429, "provider_rate_limit", "NVIDIA's transcription limit was reached. Try again later.");
    case status.DEADLINE_EXCEEDED:
      return new HttpError(504, "provider_timeout", "NVIDIA Parakeet took too long to respond. Try again.");
    case status.INVALID_ARGUMENT:
      return new HttpError(422, "provider_rejected", "NVIDIA Parakeet could not process this audio.");
    default:
      return new HttpError(502, "provider_error", "NVIDIA Parakeet transcription failed. Try again.");
  }
}

async function recognize(audio: Buffer, apiKey: string, model: ParakeetModel, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const metadata = new Metadata();
  metadata.set("function-id", FUNCTION_IDS[model]);
  metadata.set("authorization", `Bearer ${apiKey}`);
  const response = await new Promise<RecognitionResponse>((resolve, reject) => {
    const call = client.makeUnaryRequest(
      "/nvidia.riva.asr.RivaSpeechRecognition/Recognize",
      (request) => Buffer.from(requestType.encode(request).finish()),
      (response) => responseType.decode(response) as unknown as RecognitionResponse,
      {
        config: {
          encoding: 4, // Riva's OGGOPUS enum value.
          sampleRateHertz: 16000,
          languageCode: "en-US",
          maxAlternatives: 1,
          audioChannelCount: 1,
          enableAutomaticPunctuation: true,
        },
        audio,
      },
      metadata,
      { deadline: Date.now() + 90_000 },
      (error, response) => {
        signal?.removeEventListener("abort", cancel);
        if (signal?.aborted) reject(signal.reason);
        else if (error) reject(recognitionError(error.code));
        else if (response) resolve(response);
        else reject(recognitionError(status.INTERNAL));
      },
    );
    const cancel = () => call.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
  });
  return response.results.map((result) => result.alternatives[0]?.transcript.trim()).filter(Boolean).join(" ");
}

export async function transcribeParakeet(
  source: string | Blob, apiKey: string, { model, signal, spokenAudio }: { model: ParakeetModel; signal?: AbortSignal; spokenAudio?: Blob },
): Promise<string> {
  signal?.throwIfAborted();
  if (spokenAudio) return recognize(Buffer.from(await spokenAudio.arrayBuffer()), apiKey, model, signal);

  const workDir = await mkdtemp(path.join(os.tmpdir(), "saydraft-parakeet-"));
  try {
    const input = typeof source === "string" ? source : path.join(workDir, "input");
    if (typeof source !== "string") {
      await writeFile(input, new Uint8Array(await source.arrayBuffer()), { signal });
    }
    const output = path.join(workDir, "audio.ogg");
    await convertToOpus(input, output, signal);
    return await recognize(await readFile(output, { signal }), apiKey, model, signal);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
