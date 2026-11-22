import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCACertificates } from "node:tls";
import bundledFfmpeg from "ffmpeg-static";

/**
 * Locates ffmpeg: FFMPEG_PATH, then the bundled ffmpeg-static binary.
 */
function resolveFfmpeg(): string | null {
  const binary = process.env.FFMPEG_PATH?.trim() || bundledFfmpeg;
  if (!binary) return null;
  return spawnSync(binary, ["-hide_banner", "-version"], { windowsHide: true, timeout: 5000 }).status === 0 ? binary : null;
}

const cache = globalThis as typeof globalThis & { __saydraftFfmpeg?: string | null; __saydraftFfmpegCa?: string };

export function ffmpegPath(): string | null {
  if (cache.__saydraftFfmpeg === undefined) cache.__saydraftFfmpeg = resolveFfmpeg();
  return cache.__saydraftFfmpeg;
}

export function hasFfmpeg(): boolean {
  return ffmpegPath() !== null;
}

export class AudioToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioToolError";
  }
}

interface RunResult {
  code: number | null;
  stderr: string;
}

export function runFfmpeg(args: string[], options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<RunResult> {
  const binary = ffmpegPath();
  if (!binary) return Promise.reject(new AudioToolError("ffmpeg is not available."));
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-hide_banner", "-nostdin", ...args], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-64_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 30 * 60_000);
    const onAbort = () => child.kill("SIGKILL");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) reject(options.signal.reason ?? new Error("Aborted"));
      else resolve({ code, stderr });
    });
  });
}

const AUDIO_FORMATS = "aac,aiff,amr,amrnb,amrwb,asf,avi,caf,flac,matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,mp3,mpeg,mpegts,mpegtsraw,ogg,wav";
const MAX_TEMP_AUDIO_BYTES = 128 * 1024 * 1024;

function caBundle(): string {
  if (!cache.__saydraftFfmpegCa) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saydraft-ca-"));
    const file = path.join(dir, "roots.pem");
    fs.writeFileSync(file, getCACertificates().join("\n"));
    cache.__saydraftFfmpegCa = file;
  }
  return cache.__saydraftFfmpegCa;
}

function audioInput(file: string): string[] {
  const remote = /^https?:\/\//i.test(file);
  return [
    "-protocol_whitelist", remote ? "http,https,tcp,tls" : "file",
    "-format_whitelist", AUDIO_FORMATS,
    ...(remote ? ["-rw_timeout", "30000000"] : []),
    ...(/^https:\/\//i.test(file) ? ["-tls_verify", "1", "-ca_file", caBundle()] : []),
    "-i", file,
  ];
}

function parseClock(value: string): number | null {
  const match = /(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export interface ProbeResult {
  durationSec: number | null;
  hasAudio: boolean;
}

/** Reads duration and stream info. Falls back to decoding when the container has no duration (browser WebM). */
export async function probeAudio(file: string, signal?: AbortSignal): Promise<ProbeResult> {
  const { stderr } = await runFfmpeg(audioInput(file), { timeoutMs: 60_000, signal });
  const hasAudio = /Stream #\d+:\d+.*: Audio:/.test(stderr);
  const durationMatch = /Duration:\s*([0-9:.]+)/.exec(stderr);
  let durationSec = durationMatch ? parseClock(durationMatch[1]) : null;
  if (hasAudio && (durationSec === null || durationSec <= 0)) {
    const decoded = await runFfmpeg([...audioInput(file), "-vn", "-f", "null", "-"], { timeoutMs: 120_000, signal });
    const times = [...decoded.stderr.matchAll(/time=\s*([0-9:.]+)/g)];
    durationSec = times.length ? parseClock(times[times.length - 1][1]) : null;
  }
  return { durationSec: durationSec !== null && durationSec > 0 ? Math.round(durationSec * 100) / 100 : null, hasAudio };
}

function failure(result: RunResult, what: string): AudioToolError {
  const lines = result.stderr.trim().split(/\r?\n/).filter(Boolean);
  const reason = lines.slice(-2).join(" ").replace(/https?:\/\/\S+/g, "audio source").slice(0, 300);
  return new AudioToolError(`${what} failed${reason ? `: ${reason}` : "."}`);
}

function checkPreparedAudio(result: RunResult, output: string, operation: string): void {
  if (result.code !== 0 || !fs.existsSync(output)) throw failure(result, operation);
  // The MP4 trailer and the last audio packet can straddle ffmpeg's size cutoff.
  if (fs.statSync(output).size >= MAX_TEMP_AUDIO_BYTES - 256 * 1024) {
    throw new AudioToolError("The converted audio is too large. Split it into shorter files and try again.");
  }
}

/** Converts any audio/video file to compact mono AAC (.m4a) for storage and playback. */
export async function convertToM4a(input: string, output: string, signal?: AbortSignal): Promise<void> {
  const result = await runFfmpeg(
    ["-y", ...audioInput(input), "-vn", "-map", "0:a:0", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
      "-fs", String(MAX_TEMP_AUDIO_BYTES), output],
    { signal },
  );
  checkPreparedAudio(result, output, "Converting the audio");
}

/** Rewrites a browser recording's container (no re-encoding) so it gets a duration and seek index. */
export async function remuxAudio(input: string, output: string, signal?: AbortSignal): Promise<void> {
  const mp4 = /\.(m4a|mp4)$/i.test(output) ? ["-movflags", "+faststart"] : [];
  const result = await runFfmpeg(["-y", ...audioInput(input), "-map", "0:a:0", "-c", "copy", ...mp4,
    "-fs", String(MAX_TEMP_AUDIO_BYTES), output], { signal });
  checkPreparedAudio(result, output, "Repairing the recording");
}

/** Splits audio into mono 16 kHz MP3 pieces of at most segmentSec seconds (small enough for the API). */
export async function splitForTranscription(input: string, outDir: string, segmentSec: number, signal?: AbortSignal): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const pattern = path.join(outDir, "part-%04d.mp3");
  const result = await runFfmpeg(
    [
      "-y", ...audioInput(input), "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
      "-f", "segment", "-segment_time", String(segmentSec), "-reset_timestamps", "1", pattern,
    ],
    { signal },
  );
  const parts = fs
    .readdirSync(outDir)
    .filter((name) => /^part-\d{4}\.mp3$/.test(name))
    .sort()
    .map((name) => path.join(outDir, name))
    .filter((file) => fs.statSync(file).size > 0);
  if (result.code !== 0 || parts.length === 0) throw failure(result, "Splitting the audio");
  return parts;
}

/** Produces one bounded transcription piece so the workflow can retry it independently. */
export async function extractAudioPiece(input: string, output: string, startSec: number, lengthSec: number, signal?: AbortSignal): Promise<void> {
  const result = await runFfmpeg(
    ["-y", "-ss", String(startSec), ...audioInput(input), "-t", String(lengthSec), "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000",
      "-c:a", "libmp3lame", "-b:a", "32k", output],
    { signal },
  );
  if (result.code !== 0 || !fs.existsSync(output) || fs.statSync(output).size <= 1024) throw failure(result, "Reading the audio segment");
}

/** Joins several audio files (any formats) into one .m4a file. */
export async function concatToM4a(inputs: string[], output: string, signal?: AbortSignal): Promise<void> {
  const args: string[] = ["-y"];
  for (const input of inputs) args.push(...audioInput(input));
  const prepared = inputs.map((_, index) => `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono[a${index}]`);
  const joined = `${inputs.map((_, index) => `[a${index}]`).join("")}concat=n=${inputs.length}:v=0:a=1[out]`;
  args.push("-filter_complex", [...prepared, joined].join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
    "-fs", String(MAX_TEMP_AUDIO_BYTES), output);
  const result = await runFfmpeg(args, { signal });
  checkPreparedAudio(result, output, "Joining the audio");
}
