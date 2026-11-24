// Limits for the "Pro+" plan, which every user of this app gets for free.

/** Longest single recording: 3 hours. */
export const MAX_RECORDING_SEC = 180 * 60;
/** The browser starts a fresh, standalone audio file every 10 minutes while recording. */
export const RECORDING_SEGMENT_SEC = 10 * 60;
export const RECORDING_BITRATE = 48_000;

/** Files at or below this size (and short enough) go to the transcription API unchanged. */
export const DIRECT_TRANSCRIBE_MAX_BYTES = 24 * 1024 * 1024;
/** Single-request fast path cap (stays safely under Vercel's 4.5 MB request body limit; ~11 min at 48 kbps). */
export const QUICK_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
/** Longest audio sent in a single transcription request (the API caps this per request). */
export const DIRECT_TRANSCRIBE_MAX_SEC = 20 * 60;
/** Chunk length when audio has to be split for transcription. */
export const TRANSCRIBE_CHUNK_SEC = 10 * 60;
export const DIARIZE_CHUNK_SEC = 20 * 60;

/** Default matches the maximum object size of a Supabase Free project. */
export const DEFAULT_UPLOAD_MAX_MB = 50;

export const NOTE_TEXT_MAX = 1_000_000;
export const REWRITE_INPUT_MAX = 400_000;
export const TITLE_MAX = 200;
export const TAG_TITLE_MAX = 40;
export const DICTIONARY_WORD_MAX = 60;
export const DICTIONARY_WORDS_MAX = 5;
export const PROMPT_BODY_MAX = 20_000;
export const INSTRUCTION_MAX = 2_000;

/** File types the transcription API accepts without conversion. */
export const DIRECT_AUDIO_EXTENSIONS = new Set([
  "flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm",
]);

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/x-aac": "aac",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "audio/x-matroska": "mka",
  "audio/x-ms-wma": "wma",
  "audio/amr": "amr",
  "audio/3gpp": "3gp",
  "video/3gpp": "3gp",
};

/** Extensions we accept for upload when ffmpeg is available to convert them. */
export const CONVERTIBLE_EXTENSIONS = new Set([
  ...DIRECT_AUDIO_EXTENSIONS,
  "aac", "mov", "mkv", "mka", "wma", "amr", "3gp", "opus", "aiff", "aif", "caf", "avi", "wmv", "m4v", "ts",
]);

export const EXT_TO_MIME: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
};

export function baseMime(raw: string | null | undefined): string {
  return (raw || "").split(";")[0].trim().toLowerCase();
}

export function extensionFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

/** Best-effort file extension for an upload, from its MIME type or file name. */
export function audioExtension(mime: string | null | undefined, name?: string | null): string | null {
  const fromName = extensionFromName(name);
  if (fromName && CONVERTIBLE_EXTENSIONS.has(fromName)) return fromName;
  const fromMime = MIME_TO_EXT[baseMime(mime)];
  return fromMime ?? null;
}
