import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { concatToM4a, convertToM4a, convertToOpus, hasFfmpeg, probeAudio, remuxAudio, runFfmpeg, splitForTranscription } from "../../src/server/audio.ts";
import { filterWhisperSegments, transcribe } from "../../src/server/openai.ts";
import { selectSpeechRanges } from "../../src/server/speech-audio.ts";

const skip = hasFfmpeg() ? false : "ffmpeg is not installed";

async function makeTone(file: string, seconds: number, codec: string[]): Promise<void> {
  const result = await runFfmpeg(["-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-ac", "1", ...codec, file]);
  assert.equal(result.code, 0, result.stderr);
}

test("long audio is split into transcription-sized pieces", { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saydraft-audio-"));
  try {
    const source = path.join(dir, "long.webm");
    await makeTone(source, 25 * 60, ["-c:a", "libopus", "-b:a", "16k"]);
    const probe = await probeAudio(source);
    assert.ok(probe.hasAudio);
    assert.ok(probe.durationSec && Math.abs(probe.durationSec - 1500) < 2, `duration ${probe.durationSec}`);

    const parts = await splitForTranscription(source, path.join(dir, "parts"), 600);
    assert.equal(parts.length, 3);
    const durations = await Promise.all(parts.map(async (part) => (await probeAudio(part)).durationSec ?? 0));
    assert.ok(Math.abs(durations[0] - 600) < 2 && Math.abs(durations[1] - 600) < 2, `durations ${durations}`);
    assert.ok(Math.abs(durations.reduce((sum, value) => sum + value, 0) - 1500) < 3);
    for (const part of parts) assert.ok(fs.statSync(part).size < 24 * 1024 * 1024);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convert, repair and join audio files", { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saydraft-audio-"));
  try {
    const wav = path.join(dir, "a.wav");
    const webm = path.join(dir, "b.webm");
    await makeTone(wav, 3, ["-c:a", "pcm_s16le", "-ar", "22050"]);
    await makeTone(webm, 2, ["-c:a", "libopus"]);

    const m4a = path.join(dir, "a.m4a");
    await convertToM4a(wav, m4a);
    assert.ok(Math.abs(((await probeAudio(m4a)).durationSec ?? 0) - 3) < 0.3);

    const ogg = path.join(dir, "b.ogg");
    await convertToOpus(webm, ogg);
    assert.equal(fs.readFileSync(ogg).subarray(0, 4).toString(), "OggS");
    assert.ok(Math.abs(((await probeAudio(ogg)).durationSec ?? 0) - 2) < 0.3);

    const repaired = path.join(dir, "b-fixed.webm");
    await remuxAudio(webm, repaired);
    assert.ok(Math.abs(((await probeAudio(repaired)).durationSec ?? 0) - 2) < 0.3);

    const joined = path.join(dir, "joined.m4a");
    await concatToM4a([m4a, repaired], joined);
    assert.ok(Math.abs(((await probeAudio(joined)).durationSec ?? 0) - 5) < 0.4);

    const text = path.join(dir, "not-audio.txt");
    fs.writeFileSync(text, "hello");
    await assert.rejects(convertToM4a(text, path.join(dir, "bad.m4a")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("final Whisper transcription skips water-like noise without calling the provider", { skip }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saydraft-noisy-audio-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "shower.webm");
  const generated = await runFfmpeg([
    "-y", "-f", "lavfi", "-i", "anoisesrc=r=16000:c=pink:a=0.45:d=5:s=8591",
    "-af", "highpass=f=250,lowpass=f=6500", "-c:a", "libopus", filePath,
  ]);
  assert.equal(generated.code, 0, generated.stderr);

  const apiKey = process.env.OPENAI_API_KEY;
  t.after(() => {
    if (apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = apiKey;
  });
  process.env.OPENAI_API_KEY = "test-key";
  const provider = t.mock.method(globalThis, "fetch", async () => Response.json({ text: "Live preview" }));
  const input = { filePath, fileName: "shower.webm", mime: "audio/webm", model: "whisper-large-v3", language: "en" };

  assert.deepEqual(await transcribe(input), { text: "" });
  assert.equal(provider.mock.callCount(), 0);
  assert.equal((await transcribe({ ...input, preview: true })).text, "Live preview");
  assert.equal(provider.mock.callCount(), 1);
});

test("VAD range selection ignores isolated splash spikes and merges adjacent speech spans", () => {
  // 100 frames (~3.2s) with 6 isolated 1-frame spikes separated by quiet frames -> must stay empty.
  const splashes = new Array<number>(100).fill(0.02);
  for (const i of [5, 15, 25, 35, 45, 55]) splashes[i] = 0.85;
  assert.deepEqual(selectSpeechRanges(splashes, splashes.length * 1024), []);

  // Two short bursts of real speech (5 frames each) 0.5s apart merge cleanly into one padded range.
  const speech = new Array<number>(140).fill(0.02);
  for (let i = 40; i < 45; i++) speech[i] = 0.9;
  for (let i = 60; i < 66; i++) speech[i] = 0.9;
  const ranges = selectSpeechRanges(speech, speech.length * 1024);
  assert.equal(ranges.length, 1);
  assert.ok(ranges[0][0] < 40 * 1024 && ranges[0][1] > 66 * 1024);
});

test("Whisper segment filter strips shower-noise hallucinations while preserving real speech", () => {
  const prompt = "Names and terms that may appear: Ixena, Saydraft.";
  const segments = [
    { text: "Welcome to the next episode of the video. so so so so so so put it in the pan", noSpeechProb: 0.1, avgLogprob: -0.6, compressionRatio: 2.8 },
    { text: "Thank you.", noSpeechProb: 0.92, avgLogprob: -0.7, compressionRatio: 0.6 },
    { text: "Ixena, Saydraft.", noSpeechProb: 0.05, avgLogprob: -0.75, compressionRatio: 0.68 },
    { text: "Tell my friend about unramping crypto to the Ixena app for his friends.", noSpeechProb: 0.01, avgLogprob: -0.22, compressionRatio: 1.01 },
    { text: "you", noSpeechProb: 0.0, avgLogprob: -1.21, compressionRatio: 0.33 },
    { text: " .", noSpeechProb: 0.0, avgLogprob: -0.9, compressionRatio: 0.2 },
    { text: "so so so so so so it's in the pan", noSpeechProb: 0.1, avgLogprob: -0.55, compressionRatio: 2.1 },
  ];
  assert.deepEqual(
    filterWhisperSegments(segments, prompt).map((segment) => segment.text),
    ["Tell my friend about unramping crypto to the Ixena app for his friends."],
  );
});
