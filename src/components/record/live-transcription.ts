import { LIVE_PREVIEW_CLIP_MS, LIVE_PREVIEW_MAX_BYTES, RECORDING_BITRATE } from "../../lib/limits.ts";
import { type AudioSource, readLevel } from "./audio-source.ts";
import { pickMimeType } from "./segment-recorder.ts";

export interface LivePreview {
  text: string;
  interim?: string;
  engine: "speech" | "clips";
  status: "listening" | "delayed" | "unavailable";
  message?: string;
}

export interface LiveTranscriptionOptions {
  /** False when the user selected a non-default microphone (Web Speech API only captures the system default mic). */
  useSystemMic?: boolean;
}

interface ClipResponse {
  text?: string;
  error?: { code: string; message: string };
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript?: string; readonly confidence?: number };
}

interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onspeechstart?: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const CONFIG_ERRORS = new Set(["key_missing", "provider_auth", "provider_model", "provider_quota"]);
const SPEECH_LEVEL_THRESHOLD = 0.032;
const WATCHDOG_LEVEL_THRESHOLD = 0.055;
const WATCHDOG_SPEECH_MS = 3_000;
const CLIP_MIN_MS = 900;
const CLIP_MIN_VOICED_TICKS = 4;
const CLIP_PAUSE_FLUSH_MS = 420;
const SPEECH_FAST_RESTART_MS = 20;
const SPEECH_BACKOFF_RESTART_MS = 250;
const QUICK_END_MS = 1_000;
const MAX_QUICK_ENDS = 3;
const MAX_CONSECUTIVE_REJECTED = 3;

const SPEECH_LOCALE_OVERRIDES: Record<string, string> = {
  ar: "ar-SA",
  en: "en-US",
  he: "he-IL",
  ms: "ms-MY",
  no: "nb-NO",
  pa: "pa-Guru-IN",
  pt: "pt-BR",
  sr: "sr-RS",
  sw: "sw-KE",
  tl: "fil-PH",
  zh: "zh-CN",
};

const NO_SPACE_AFTER = /[([{<（【「『“‘]$/;
const NO_SPACE_BEFORE = /^[,.;:!?)}\]}>、。，！？；：”’]/;
const CJK_OR_THAI = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/;

const blockedRecognizers = new WeakSet<SpeechRecognitionCtor>();

/** Chooses the separator between two transcript pieces without inserting spaces into CJK or before punctuation. */
export function transcriptSeparator(before: string, after: string): string {
  const left = before.trimEnd();
  const right = after.trimStart();
  if (!left || !right) return "";
  if (NO_SPACE_BEFORE.test(right) || NO_SPACE_AFTER.test(left)) return "";
  const lastChar = left[left.length - 1];
  const firstChar = right[0];
  if (CJK_OR_THAI.test(lastChar) && CJK_OR_THAI.test(firstChar)) return "";
  return " ";
}

export function joinTranscript(...parts: Array<string | undefined>): string {
  let out = "";
  for (const raw of parts) {
    const piece = raw?.trim();
    if (!piece) continue;
    out = out ? `${out}${transcriptSeparator(out, piece)}${piece}` : piece;
  }
  return out;
}

/** Maps Whisper ISO 639-1 codes to Chrome-friendly BCP-47 locales while honoring the user's regional variant. */
export function speechLocale(language: string, browserLocale?: string): string | undefined {
  const navLocale = (browserLocale ?? (typeof navigator !== "undefined" ? navigator.language : "")).trim();
  if (!language || language === "auto") return navLocale || undefined;
  const code = language.toLowerCase();
  if (navLocale && (navLocale.toLowerCase() === code || navLocale.toLowerCase().startsWith(`${code}-`))) {
    return navLocale;
  }
  return SPEECH_LOCALE_OVERRIDES[code] ?? language;
}

function isBraveBrowser(): boolean {
  return typeof navigator !== "undefined" && "brave" in navigator;
}

function isAndroidBrowser(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  // Brave exposes webkitSpeechRecognition but strips Google's cloud speech key, so it fails with network errors.
  if (isBraveBrowser()) return undefined;
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return ctor && !blockedRecognizers.has(ctor) ? ctor : undefined;
}

/** Fallback: send short, pause-flushed clips when browser speech recognition is unavailable. */
function startClipTranscription(
  source: Pick<AudioSource, "stream" | "analyser">,
  language: string,
  previousText: string,
  onPreview: (preview: LivePreview) => void,
): () => void {
  const url = `/api/record/live?${new URLSearchParams({ language })}`;
  const mimeType = pickMimeType();
  const levels = new Uint8Array(source.analyser.fftSize);
  let text = previousText.trim();
  let status: LivePreview["status"] = "listening";
  let closed = false;
  let capture: MediaRecorder | undefined;
  let rotate: (() => void) | undefined;
  let request: AbortController | undefined;
  let pendingClip: Blob | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAt = 0;
  let clipStartedAt = Date.now();
  let heardAudio = false;
  let voicedTicks = 0;
  let lastSpeechAt = 0;
  let consecutiveRejected = 0;

  const meter = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    if (status === "delayed" && now >= retryAt) {
      status = "listening";
      onPreview({ text, engine: "clips", status: "listening" });
    }
    if (readLevel(source.analyser, levels) > SPEECH_LEVEL_THRESHOLD) {
      heardAudio = true;
      voicedTicks += 1;
      lastSpeechAt = now;
    }
    const pauseReady =
      heardAudio &&
      voicedTicks >= CLIP_MIN_VOICED_TICKS &&
      now - clipStartedAt >= CLIP_MIN_MS &&
      now - lastSpeechAt >= CLIP_PAUSE_FLUSH_MS;
    if (pauseReady || now - clipStartedAt >= LIVE_PREVIEW_CLIP_MS) {
      rotate?.();
    }
  }, 80);

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(meter);
    clearTimeout(startTimer);
    clearTimeout(drainTimer);
    rotate = undefined;
    pendingClip = undefined;
    request?.abort();
    if (capture && capture.state !== "inactive") {
      capture.onstop = capture.ondataavailable = capture.onerror = null;
      // Preview teardown must not throw into the main recorder's Stop/Pause handlers.
      try { capture.stop(); } catch {}
    }
  }

  function unavailable(message: string) {
    status = "unavailable";
    close();
    onPreview({ text, engine: "clips", status: "unavailable", message });
  }

  function delayPreview(message: string, ms: number) {
    status = "delayed";
    retryAt = Date.now() + ms;
    pendingClip = undefined;
    clearTimeout(drainTimer);
    onPreview({ text, engine: "clips", status: "delayed", message });
  }

  function scheduleDrain(delayMs: number) {
    clearTimeout(drainTimer);
    drainTimer = setTimeout(() => {
      if (!closed && !request && pendingClip && Date.now() >= retryAt) {
        const next = pendingClip;
        pendingClip = undefined;
        void send(next);
      }
    }, delayMs);
  }

  function enqueue(clip: Blob) {
    if (closed || clip.size === 0 || clip.size > LIVE_PREVIEW_MAX_BYTES) return;
    if (request || Date.now() < retryAt) {
      // ponytail: keep at most one latest pending clip under backpressure instead of growing an unbounded queue.
      if (status !== "delayed") pendingClip = clip;
      return;
    }
    if (pendingClip) {
      const older = pendingClip;
      pendingClip = clip;
      void send(older);
      return;
    }
    void send(clip);
  }

  async function send(clip: Blob) {
    if (closed || request || Date.now() < retryAt || clip.size === 0 || clip.size > LIVE_PREVIEW_MAX_BYTES) return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { method: "POST", body: clip, signal: controller.signal });
      const result = await response.json().catch(() => null) as ClipResponse | null;
      if (closed) return;
      if (!response.ok) {
        const code = result?.error?.code ?? "";
        if (response.status === 429 && code === "live_rate_limit") {
          retryAt = Date.now() + 600;
          pendingClip = pendingClip ?? clip;
          scheduleDrain(620);
        } else if (response.status === 429 && code !== "provider_quota") {
          delayPreview("The transcription service is busy. Live will retry shortly.", 8_000);
        } else if (response.status === 422 && code === "provider_rejected") {
          consecutiveRejected += 1;
          if (consecutiveRejected >= MAX_CONSECUTIVE_REJECTED) {
            unavailable(result?.error?.message ?? "Could not transcribe this preview.");
          }
        } else if (response.status >= 500 && !CONFIG_ERRORS.has(code)) {
          delayPreview("The transcription service didn’t respond. Live will retry shortly.", 5_000);
        } else {
          unavailable(result?.error?.message ?? "Could not transcribe this preview.");
        }
        return;
      }
      if (typeof result?.text !== "string") {
        delayPreview("The transcription service returned an unexpected response. Live will retry shortly.", 5_000);
        return;
      }
      consecutiveRejected = 0;
      status = "listening";
      const chunk = result.text.trim();
      if (chunk) text = joinTranscript(text, chunk);
      onPreview({ text, engine: "clips", status: "listening" });
    } catch {
      if (!closed) delayPreview("Could not reach the transcription service. Live will retry shortly.", 5_000);
    } finally {
      clearTimeout(timeout);
      request = undefined;
      if (!closed && pendingClip && Date.now() >= retryAt) {
        const next = pendingClip;
        pendingClip = undefined;
        void send(next);
      }
    }
  }

  function recordClip() {
    try {
      const recorder = new MediaRecorder(source.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: RECORDING_BITRATE,
      });
      const parts: Blob[] = [];
      let hasAudio = false;
      recorder.ondataavailable = ({ data }) => {
        if (!closed && data.size > 0) parts.push(data);
      };
      recorder.onstop = () => {
        if (!closed && hasAudio) {
          enqueue(new Blob(parts, { type: recorder.mimeType || parts[0]?.type || mimeType || "audio/webm" }));
        }
      };
      recorder.onerror = () => {
        if (!closed) unavailable("This browser couldn’t capture a live audio preview.");
      };
      recorder.start();
      capture = recorder;
      clipStartedAt = Date.now();
      rotate = () => {
        hasAudio = heardAudio;
        heardAudio = false;
        voicedTicks = 0;
        lastSpeechAt = 0;
        if (recorder.state === "inactive") {
          unavailable("Live audio capture stopped.");
          return;
        }
        // Start the next recorder before stopping this one so no speech drops at clip boundaries.
        recordClip();
        if (closed) return;
        try {
          recorder.stop();
        } catch {
          unavailable("Live audio capture stopped.");
        }
      };
    } catch {
      unavailable("This browser couldn’t capture a live audio preview.");
    }
  }

  onPreview({ text, engine: "clips", status: "listening" });
  // Defer start by one tick so React Strict Mode's mount/cleanup cycle doesn't create a throwaway recorder.
  startTimer = setTimeout(() => {
    if (!closed) recordClip();
  }, 0);
  return close;
}

/**
 * Word-by-word live preview via the browser's Web Speech API when available,
 * falling back to short server-transcribed clips on unsupported or blocked browsers.
 * The main recorder still saves the full audio for the final transcript on Stop.
 */
export function startLiveTranscription(
  source: Pick<AudioSource, "stream" | "analyser">,
  language: string,
  previousText: string,
  onPreview: (preview: LivePreview) => void,
  options: LiveTranscriptionOptions = {},
): () => void {
  const Recognition = options.useSystemMic === false ? undefined : speechRecognitionCtor();
  if (!Recognition) return startClipTranscription(source, language, previousText, onPreview);
  const SpeechRec: SpeechRecognitionCtor = Recognition;
  const isAndroid = isAndroidBrowser();

  // ponytail: Web Speech API listens on the system default mic and cannot bind a custom deviceId;
  // callers pass useSystemMic: false for confirmed non-default mics, and a voiced-audio watchdog catches silent mismatches.
  const levels = new Uint8Array(source.analyser.fftSize);
  let committed = previousText.trim();
  let sessionFinal = "";
  let interim = "";
  let closed = false;
  let recognition: SpeechRecognitionLike | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackClose: (() => void) | undefined;
  let startedAt = 0;
  let gotResult = false;
  let everGotResult = false;
  let quickEnds = 0;
  let voicedMs = 0;
  let networkRetries = 0;
  let audioCaptureRetries = 0;
  let restartDelayMs = SPEECH_FAST_RESTART_MS;

  const watchdog = setInterval(() => {
    if (closed || everGotResult || fallbackClose) return;
    if (readLevel(source.analyser, levels) > WATCHDOG_LEVEL_THRESHOLD) {
      voicedMs += 80;
    } else {
      voicedMs = Math.max(0, voicedMs - 40);
    }
    if (voicedMs >= WATCHDOG_SPEECH_MS) {
      fallback(false);
    }
  }, 80);

  function teardownRecognition() {
    clearInterval(watchdog);
    clearTimeout(restartTimer);
    restartTimer = undefined;
    const rec = recognition;
    recognition = undefined;
    if (rec) {
      rec.onresult = rec.onspeechstart = rec.onerror = rec.onend = null;
      // Preview teardown must not throw into the main recorder's Stop/Pause handlers.
      try { rec.abort(); } catch {}
    }
  }

  function fallback(rememberBlock = false) {
    if (closed || fallbackClose) return;
    if (rememberBlock && !everGotResult) blockedRecognizers.add(SpeechRec);
    committed = joinTranscript(committed, sessionFinal, interim);
    sessionFinal = "";
    interim = "";
    teardownRecognition();
    fallbackClose = startClipTranscription(source, language, committed, onPreview);
  }

  function begin() {
    if (closed || fallbackClose) return;
    let rec: SpeechRecognitionLike;
    try {
      rec = new SpeechRec();
    } catch {
      fallback(true);
      return;
    }
    rec.continuous = !isAndroid;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const locale = speechLocale(language);
    if (locale) rec.lang = locale;

    recognition = rec;
    startedAt = Date.now();
    gotResult = false;
    sessionFinal = "";
    interim = "";
    restartDelayMs = SPEECH_FAST_RESTART_MS;

    rec.onspeechstart = () => {
      if (closed || recognition !== rec) return;
      // Chrome detected speech on the system mic; give it room to emit its first word before watchdog trips.
      voicedMs = Math.min(voicedMs, WATCHDOG_SPEECH_MS / 2);
    };

    rec.onresult = (event) => {
      if (closed || recognition !== rec) return;
      gotResult = true;
      networkRetries = 0;
      audioCaptureRetries = 0;
      quickEnds = 0;
      if (!everGotResult) {
        everGotResult = true;
        clearInterval(watchdog);
      }
      const finals: string[] = [];
      const interims: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result?.[0]?.transcript?.trim();
        if (!piece) continue;
        if (result.isFinal) {
          // Guard against Chrome Android's cumulative isFinal snapshots extending the previous final prefix.
          const prev = finals[finals.length - 1];
          if (isAndroid && prev && piece.toLowerCase().startsWith(prev.toLowerCase())) {
            finals[finals.length - 1] = piece;
          } else {
            finals.push(piece);
          }
        } else {
          interims.push(piece);
        }
      }
      sessionFinal = joinTranscript(...finals);
      interim = joinTranscript(...interims);
      onPreview({
        text: joinTranscript(committed, sessionFinal),
        interim,
        engine: "speech",
        status: "listening",
      });
    };

    rec.onerror = (event) => {
      if (closed || recognition !== rec) return;
      const code = event.error ?? "";
      // "no-speech" and "aborted" are normal pauses/resets; onend will restart cleanly.
      if (code === "no-speech" || code === "aborted") return;
      if (code === "service-not-allowed") {
        fallback(true);
        return;
      }
      if (code === "network") {
        networkRetries += 1;
        const maxRetries = everGotResult ? 2 : 1;
        if (networkRetries <= maxRetries) {
          restartDelayMs = SPEECH_BACKOFF_RESTART_MS;
          return;
        }
        const online = typeof navigator === "undefined" || navigator.onLine !== false;
        fallback(!everGotResult && online);
        return;
      }
      if (code === "audio-capture" && audioCaptureRetries === 0) {
        audioCaptureRetries += 1;
        restartDelayMs = SPEECH_BACKOFF_RESTART_MS;
        return;
      }
      fallback(false);
    };

    rec.onend = () => {
      if (closed || recognition !== rec) return;
      recognition = undefined;
      const nextCommitted = joinTranscript(committed, sessionFinal, interim);
      const changed = nextCommitted !== committed || interim !== "";
      committed = nextCommitted;
      sessionFinal = "";
      interim = "";
      if (changed) {
        onPreview({ text: committed, interim: "", engine: "speech", status: "listening" });
      }
      if (!gotResult && Date.now() - startedAt < QUICK_END_MS) {
        quickEnds += 1;
        if (quickEnds >= MAX_QUICK_ENDS) {
          fallback(false);
          return;
        }
        restartDelayMs = SPEECH_BACKOFF_RESTART_MS;
      } else {
        quickEnds = 0;
      }
      restartTimer = setTimeout(() => {
        if (!closed) begin();
      }, restartDelayMs);
    };

    try {
      rec.start();
    } catch {
      fallback(false);
    }
  }

  onPreview({ text: committed, interim: "", engine: "speech", status: "listening" });
  // Defer start by one tick so React Strict Mode's mount/cleanup/remount doesn't collide abort() with start().
  restartTimer = setTimeout(() => {
    if (!closed) begin();
  }, 0);

  return function close() {
    if (closed) return;
    closed = true;
    teardownRecognition();
    fallbackClose?.();
    fallbackClose = undefined;
  };
}
