import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { env, InferenceSession, Tensor } from "onnxruntime-web";
import { DIRECT_TRANSCRIBE_MAX_SEC } from "../lib/limits.ts";
import { TRANSCRIPTION_SAMPLE_RATE, convertToOpus, decodeTranscriptionPcm, hasFfmpeg } from "./audio.ts";

const PCM_BYTES_PER_SECOND = TRANSCRIPTION_SAMPLE_RATE * 2;
const MAX_PCM_BYTES = DIRECT_TRANSCRIBE_MAX_SEC * PCM_BYTES_PER_SECOND;
const HIGH_BITRATE_MAX_PCM_BYTES = 9 * 60 * PCM_BYTES_PER_SECOND;
const FRAME_SAMPLES = 512;
const CONTEXT_SAMPLES = 64;
const FRAME_BYTES = FRAME_SAMPLES * 2;
const START_THRESHOLD = 0.35;
const END_THRESHOLD = 0.20;
const MIN_SPEECH_FRAMES = 4;
const LEAD_PADDING_BYTES = Math.round(0.4 * PCM_BYTES_PER_SECOND) & ~1;
const TRAIL_PADDING_BYTES = Math.round(0.5 * PCM_BYTES_PER_SECOND) & ~1;
const GAP_SILENCE_BYTES = Math.round(0.35 * PCM_BYTES_PER_SECOND) & ~1;
const TAIL_SILENCE_BYTES = Math.round(0.35 * PCM_BYTES_PER_SECOND) & ~1;
const FADE_SAMPLES = Math.round(0.015 * TRANSCRIPTION_SAMPLE_RATE);
const MODEL_PATH = path.join(process.cwd(), "node_modules/@ricky0123/vad-web/dist/silero_vad_v6.onnx");

let session: Promise<InferenceSession> | undefined;

function speechDetector(): Promise<InferenceSession> {
  if (!session) {
    env.wasm.numThreads = 1;
    session = InferenceSession.create(MODEL_PATH, { executionProviders: ["wasm"] }).catch((error) => {
      session = undefined;
      throw error;
    });
  }
  return session;
}

/** Collects merged [startByte, endByte] speech spans from Silero VAD probabilities. */
export function selectSpeechRanges(probabilities: number[], totalBytes: number): Array<[number, number]> {
  const limit = totalBytes & ~1;
  const ranges: Array<[number, number]> = [];
  let candidateStart: number | undefined;
  let confirmedStart: number | undefined;
  let quietStart: number | undefined;
  let consecutiveSpeech = 0;

  function finishSpeech(end: number) {
    if (confirmedStart !== undefined) {
      const start = Math.max(0, confirmedStart - LEAD_PADDING_BYTES);
      const stop = Math.min(limit, end + TRAIL_PADDING_BYTES);
      const previous = ranges[ranges.length - 1];
      if (previous && start <= previous[1]) {
        previous[1] = Math.max(previous[1], stop);
      } else if (stop > start) {
        ranges.push([start, stop]);
      }
    }
    candidateStart = undefined;
    confirmedStart = undefined;
    quietStart = undefined;
    consecutiveSpeech = 0;
  }

  for (let frame = 0; frame < probabilities.length; frame++) {
    const offset = frame * FRAME_BYTES;
    const probability = probabilities[frame];
    if (probability >= START_THRESHOLD) {
      candidateStart ??= offset;
      consecutiveSpeech += 1;
      if (consecutiveSpeech >= MIN_SPEECH_FRAMES) confirmedStart ??= candidateStart;
      quietStart = undefined;
    } else if (probability < END_THRESHOLD) {
      if (confirmedStart === undefined) {
        // Drop isolated splash/click spikes before they can accumulate across quiet noise.
        candidateStart = undefined;
        consecutiveSpeech = 0;
      } else {
        quietStart ??= offset;
        if (offset - quietStart >= PCM_BYTES_PER_SECOND) finishSpeech(quietStart);
      }
    }
  }
  finishSpeech(limit);
  return ranges;
}

function assembleSpeechPcm(pcm: Buffer, ranges: Array<[number, number]>): Buffer[] {
  const limit = pcm.length & ~1;
  const gapSilence = Buffer.alloc(GAP_SILENCE_BYTES);
  const parts: Buffer[] = [];
  for (let index = 0; index < ranges.length; index++) {
    if (index > 0) parts.push(gapSilence);
    const [start, end] = ranges[index];
    const slice = Buffer.from(pcm.subarray(start, end));
    const totalSamples = slice.length / 2;
    const fade = Math.min(FADE_SAMPLES, Math.floor(totalSamples / 2));
    if (start > 0) {
      for (let i = 0; i < fade; i++) {
        slice.writeInt16LE(Math.round(slice.readInt16LE(i * 2) * (i / fade)), i * 2);
      }
    }
    if (end < limit) {
      for (let i = 0; i < fade; i++) {
        const byteIndex = (totalSamples - 1 - i) * 2;
        slice.writeInt16LE(Math.round(slice.readInt16LE(byteIndex) * (i / fade)), byteIndex);
      }
    }
    parts.push(slice);
  }
  // Brief trailing silence prevents CTC/Opus tail framing from clipping the final syllable.
  parts.push(Buffer.alloc(TAIL_SILENCE_BYTES));
  return parts;
}

async function speechRanges(pcm: Buffer, signal: AbortSignal): Promise<Array<[number, number]>> {
  const detector = await speechDetector();
  // Each recording carries its own recurrent state and 4 ms of previous audio.
  const samples = new Float32Array(FRAME_SAMPLES + CONTEXT_SAMPLES);
  const input = new Tensor("float32", samples, [1, samples.length]);
  const sampleRate = new Tensor("int64", BigInt64Array.of(BigInt(TRANSCRIPTION_SAMPLE_RATE)), []);
  let state: Tensor = new Tensor("float32", new Float32Array(256), [2, 1, 128]);
  const probabilities: number[] = [];

  for (let offset = 0; offset < pcm.length; offset += FRAME_BYTES) {
    signal.throwIfAborted();
    samples.copyWithin(0, FRAME_SAMPLES);
    samples.fill(0, CONTEXT_SAMPLES);
    const count = Math.min(FRAME_SAMPLES, Math.floor((pcm.length - offset) / 2));
    for (let i = 0; i < count; i++) {
      samples[CONTEXT_SAMPLES + i] = pcm.readInt16LE(offset + i * 2) / 32768;
    }
    const result = await detector.run({ input, state, sr: sampleRate });
    state = result.stateN;
    probabilities.push(Number(result.output.data[0]));
    // Yield after about one second of audio so long recordings permit cancellation.
    if (offset % (32 * FRAME_BYTES) === 0) await setImmediate(undefined, { signal });
  }
  return selectSpeechRanges(probabilities, pcm.length);
}

/** Returns trimmed Opus, null for no detected speech, or undefined to use the original audio. */
export async function prepareSpeechAudio(source: string | Blob, signal?: AbortSignal): Promise<Blob | null | undefined> {
  if (!hasFfmpeg()) return;
  signal?.throwIfAborted();
  const budget = AbortSignal.timeout(45_000);
  const workSignal = signal ? AbortSignal.any([signal, budget]) : budget;
  const dir = await mkdtemp(path.join(os.tmpdir(), "saydraft-speech-"));
  try {
    const input = typeof source === "string" ? source : path.join(dir, "input");
    if (typeof source !== "string") {
      await writeFile(input, new Uint8Array(await source.arrayBuffer()), { signal: workSignal });
    }
    const pcmFile = path.join(dir, "audio.pcm");
    await decodeTranscriptionPcm(input, pcmFile, MAX_PCM_BYTES + PCM_BYTES_PER_SECOND, workSignal);
    if ((await stat(pcmFile)).size > MAX_PCM_BYTES) return;

    const pcm = await readFile(pcmFile, { signal: workSignal });
    const ranges = await speechRanges(pcm, workSignal);
    if (ranges.length === 0) return null;
    const keptBytes = ranges.reduce((total, [start, end]) => total + (end - start), 0);
    if (pcm.length - keptBytes < PCM_BYTES_PER_SECOND) return;

    const slices = assembleSpeechPcm(pcm, ranges);
    await writeFile(pcmFile, slices, { signal: workSignal });
    const opusFile = path.join(dir, "speech.ogg");
    const bitrate = keptBytes <= HIGH_BITRATE_MAX_PCM_BYTES ? "48k" : "24k";
    await convertToOpus(pcmFile, opusFile, workSignal, "s16le", bitrate);
    return new Blob([new Uint8Array(await readFile(opusFile, { signal: workSignal }))], { type: "audio/ogg" });
  } catch (error) {
    signal?.throwIfAborted();
    console.warn("Speech filtering failed; using the original audio.", error instanceof Error ? error.name : "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
