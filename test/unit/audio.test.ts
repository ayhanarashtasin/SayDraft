import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { concatToM4a, convertToM4a, hasFfmpeg, probeAudio, remuxAudio, runFfmpeg, splitForTranscription } from "../../src/server/audio.ts";

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
