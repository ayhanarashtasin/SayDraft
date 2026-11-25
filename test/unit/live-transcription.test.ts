import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import {
  type LivePreview,
  joinTranscript,
  speechLocale,
  startLiveTranscription,
  transcriptSeparator,
} from "../../src/components/record/live-transcription.ts";
import { LIVE_PREVIEW_CLIP_MS } from "../../src/lib/limits.ts";

function stubRecorder(t: TestContext) {
  const recorders: PreviewRecorder[] = [];
  const stream = {} as MediaStream;
  let level = 128;

  class PreviewRecorder {
    readonly number = recorders.push(this);
    mimeType = "audio/webm;codecs=opus";
    state = "inactive";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;

    constructor(input: MediaStream) { assert.equal(input, stream); }
    static isTypeSupported() { return true; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob([`clip ${this.number}`]) });
        this.onstop?.();
      });
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: PreviewRecorder });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "MediaRecorder", descriptor);
    else Reflect.deleteProperty(globalThis, "MediaRecorder");
  });
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"] });

  const analyser = { fftSize: 512, getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(level) } as unknown as AnalyserNode;
  return {
    source: { stream, analyser },
    recorders,
    setLevel(byte: number) { level = byte; },
    speak() { level = 146; },
    silence() { level = 128; },
    async tick(ms: number) {
      t.mock.timers.tick(0);
      // Node's mock.timers advances Date.now() to the end of each tick() call before running callbacks.
      for (let remaining = ms; remaining > 0; remaining -= 80) {
        t.mock.timers.tick(Math.min(80, remaining));
      }
      await setImmediate();
    },
    async nextClip() {
      await this.tick(LIVE_PREVIEW_CLIP_MS);
    },
  };
}

test("transcript joining and Chrome locale mapping handle CJK, punctuation, and regional variants", () => {
  assert.equal(joinTranscript("Hello", "world"), "Hello world");
  assert.equal(joinTranscript("Hello", ", world", "!"), "Hello, world!");
  assert.equal(joinTranscript("こんにちは", "世界"), "こんにちは世界");
  assert.equal(transcriptSeparator("你好", "世界"), "");
  assert.equal(transcriptSeparator("hello", "?"), "");
  assert.equal(transcriptSeparator("hello", "world"), " ");

  assert.equal(speechLocale("auto", "en-GB"), "en-GB");
  assert.equal(speechLocale("en", "en-GB"), "en-GB");
  assert.equal(speechLocale("zh", "zh-TW"), "zh-TW");
  assert.equal(speechLocale("zh", "en-US"), "zh-CN");
  assert.equal(speechLocale("tl", "en-US"), "fil-PH");
  assert.equal(speechLocale("no", "en-US"), "nb-NO");
  assert.equal(speechLocale("es", "en-US"), "es");
});

test("live preview skips silence and appends independent clips in order before Stop", async (t) => {
  const recorder = stubRecorder(t);
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/record/live?language=es");
    assert.equal(options.method, "POST");
    const clip = options.body;
    assert.ok(clip instanceof Blob);
    assert.match(clip.type, /^audio\/webm/);
    const value = await clip.text();
    requests.push(value);
    return Response.json({ text: value });
  });
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "es", "Earlier text.", (preview) => updates.push(preview));

  await recorder.nextClip();
  assert.equal(requests.length, 0);
  recorder.speak();
  await recorder.nextClip();
  await recorder.nextClip();
  assert.deepEqual(requests, ["clip 2", "clip 3"]);
  assert.deepEqual(updates.at(-1), { text: "Earlier text. clip 2 clip 3", engine: "clips", status: "listening" });
  assert.equal(recorder.recorders.at(-1)?.state, "recording");
  stop();
  await recorder.nextClip();
  assert.equal(recorder.recorders.at(-1)?.state, "inactive");
  assert.equal(requests.length, 2);
});

test("closing a preview aborts the request and ignores its result", async (t) => {
  const recorder = stubRecorder(t);
  const response = Promise.withResolvers<Response>();
  let signal: AbortSignal | null | undefined;
  const fetch = t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => {
    signal = options.signal;
    return response.promise;
  });
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "auto", "", (preview) => updates.push(preview));
  recorder.speak();
  await recorder.nextClip();
  await recorder.nextClip();
  assert.equal(fetch.mock.callCount(), 1, "only one request in flight");
  assert.equal(signal?.aborted, false);

  recorder.recorders.at(-1)!.stop = () => { throw new DOMException("Preview already stopped", "InvalidStateError"); };
  assert.doesNotThrow(stop);
  assert.equal(signal?.aborted, true);
  response.resolve(Response.json({ text: "Stale text" }));
  await recorder.nextClip();
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(updates.length, 1);
});

test("a busy provider delays preview requests and then recovers", async (t) => {
  const recorder = stubRecorder(t);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => ++requests === 1
    ? Response.json({ error: { code: "provider_rate_limit" } }, { status: 429 })
    : Response.json({ text: "Live is back." }));
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "auto", "", (preview) => updates.push(preview));
  recorder.speak();
  await recorder.nextClip();
  assert.equal(updates.at(-1)?.status, "delayed");
  for (let i = 0; i < 3; i++) await recorder.nextClip();
  assert.equal(requests, 1);
  await recorder.nextClip();
  assert.equal(requests, 2);
  assert.deepEqual(updates.at(-1), { engine: "clips", status: "listening", text: "Live is back." });
  stop();
});

test("clip preview flushes early on a short speaking pause without waiting the full clip window", async (t) => {
  const recorder = stubRecorder(t);
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const value = await (options.body as Blob).text();
    requests.push(value);
    return Response.json({ text: "hello" });
  });
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview));

  recorder.speak();
  await recorder.tick(720);
  assert.equal(requests.length, 0);
  recorder.silence();
  await recorder.tick(480);
  assert.deepEqual(requests, ["clip 1"], "flushed ~1.2s in after a brief pause instead of waiting 2s");
  assert.deepEqual(updates.at(-1), { text: "hello", engine: "clips", status: "listening" });
  stop();
});

test("clip preview survives isolated 422 rejections, clears delayed banner after cooldown, and preserves order on live_rate_limit", async (t) => {
  const recorder = stubRecorder(t);
  const seen: string[] = [];
  let attempt = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const value = await (options.body as Blob).text();
    attempt += 1;
    if (attempt === 1) return Response.json({ error: { code: "provider_rejected", message: "Too short" } }, { status: 422 });
    if (attempt === 2) return Response.json({ error: { code: "live_rate_limit", message: "Slow down" } }, { status: 429 });
    seen.push(value);
    return Response.json({ text: value });
  });
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview));

  recorder.speak();
  await recorder.nextClip(); // clip 1 -> 422 ignored (1/3)
  assert.notEqual(updates.at(-1)?.status, "unavailable");
  await recorder.nextClip(); // clip 2 -> 429 live_rate_limit -> retried after 620ms
  await recorder.tick(720);
  assert.deepEqual(seen, ["clip 2"]);
  assert.deepEqual(updates.at(-1), { text: "clip 2", engine: "clips", status: "listening" });
  stop();
});

function stubSpeechRecognition(t: TestContext, key: "SpeechRecognition" | "webkitSpeechRecognition" = "webkitSpeechRecognition") {
  const instances: FakeRecognition[] = [];

  class FakeRecognition {
    continuous = false;
    interimResults = false;
    maxAlternatives = 0;
    lang = "";
    started = false;
    aborted = false;
    onresult: ((event: { results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
    onspeechstart: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;

    constructor() { instances.push(this); }
    start() { this.started = true; }
    stop() { this.started = false; }
    abort() { this.aborted = true; this.started = false; }
    emit(results: Array<{ text: string; final?: boolean }>) {
      this.onresult?.({
        results: results.map((item) => ({ isFinal: Boolean(item.final), 0: { transcript: item.text } })),
      });
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, value: FakeRecognition });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
  return instances;
}

test("web speech API streams interim and final words without network calls and restarts rapidly on silence", async (t) => {
  const recorder = stubRecorder(t);
  const instances = stubSpeechRecognition(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("should not call /api/record/live when speech recognition works");
  });
  const updates: LivePreview[] = [];
  // Immediate close (like React Strict Mode cleanup) never starts a dangling recognition session.
  const cancelled = startLiveTranscription(recorder.source, "es", "Earlier.", () => {});
  cancelled();
  t.mock.timers.tick(0);
  assert.equal(instances.length, 0);

  const stop = startLiveTranscription(recorder.source, "es", "Earlier.", (preview) => updates.push(preview));
  t.mock.timers.tick(0);

  assert.equal(instances.length, 1);
  assert.equal(recorder.recorders.length, 0, "does not start MediaRecorder when speech recognition is active");
  const first = instances[0];
  assert.equal(first.continuous, true);
  assert.equal(first.interimResults, true);
  assert.equal(first.lang, "es");
  assert.equal(first.started, true);

  first.emit([{ text: "hola" }]);
  assert.deepEqual(updates.at(-1), { text: "Earlier.", interim: "hola", engine: "speech", status: "listening" });

  first.emit([{ text: "hola mundo", final: true }, { text: "como" }]);
  assert.deepEqual(updates.at(-1), { text: "Earlier. hola mundo", interim: "como", engine: "speech", status: "listening" });

  // Simulate Chrome pausing after silence: commits leftover text and restarts quickly (~20ms).
  first.onerror?.({ error: "no-speech" });
  first.onend?.();
  assert.deepEqual(updates.at(-1), { text: "Earlier. hola mundo como", interim: "", engine: "speech", status: "listening" });

  t.mock.timers.tick(30);
  assert.equal(instances.length, 2);
  instances[1].emit([{ text: "estas", final: true }]);
  assert.deepEqual(updates.at(-1), { text: "Earlier. hola mundo como estas", interim: "", engine: "speech", status: "listening" });

  // Transient network blip AFTER Chrome has already produced results retries without blocking SpeechRecognition.
  instances[1].onerror?.({ error: "network" });
  instances[1].onend?.();
  t.mock.timers.tick(300);
  assert.equal(instances.length, 3, "retried transient network blip instead of abandoning Chrome speech");
  assert.equal(recorder.recorders.length, 0);

  assert.equal(fetch.mock.callCount(), 0);
  stop();
  assert.equal(instances[2].aborted, true);
  instances[2].emit([{ text: "ignored after stop", final: true }]);
  assert.equal(updates.at(-1)?.text, "Earlier. hola mundo como estas");
});

test("web speech API errors fall back cleanly to server clips and remember permanent browser blocks", async (t) => {
  const recorder = stubRecorder(t);
  const instances = stubSpeechRecognition(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ text: "from clips" }));
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview));
  t.mock.timers.tick(0);

  instances[0].onerror?.({ error: "service-not-allowed" });
  instances[0].onend?.();
  t.mock.timers.tick(0);

  assert.equal(instances[0].aborted, true);
  assert.equal(recorder.recorders.length, 1, "clip fallback started");
  recorder.speak();
  await recorder.nextClip();
  assert.deepEqual(updates.at(-1), { text: "from clips", engine: "clips", status: "listening" });
  stop();
  assert.equal(recorder.recorders.at(-1)?.state, "inactive");

  // Starting again in the same browser session skips the permanently blocked recognizer immediately.
  const stopAgain = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview));
  t.mock.timers.tick(0);
  assert.equal(instances.length, 1);
  assert.equal(updates.at(-1)?.engine, "clips");
  stopAgain();
});

test("repeated empty speech restarts fall back to server clips without permanently blocking Chrome", async (t) => {
  const recorder = stubRecorder(t);
  const instances = stubSpeechRecognition(t, "SpeechRecognition");
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "auto", "", (preview) => updates.push(preview));
  t.mock.timers.tick(0);

  for (let i = 0; i < 3; i += 1) {
    instances.at(-1)!.onend?.();
    t.mock.timers.tick(300);
  }
  assert.equal(instances.length, 3);
  assert.equal(recorder.recorders.length, 1, "switched to clip fallback after 3 rapid empty ends");
  assert.equal(updates.at(-1)?.engine, "clips");
  stop();

  // Subsequent session can still use SpeechRecognition (not permanently poisoned).
  const stopLater = startLiveTranscription(recorder.source, "auto", "", () => {});
  t.mock.timers.tick(0);
  assert.equal(instances.length, 4);
  stopLater();
});

test("watchdog ignores 1-LSB room tone on Chrome and only falls back on sustained uncaptured speech", async (t) => {
  const recorder = stubRecorder(t);
  const instances = stubSpeechRecognition(t);
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview));
  t.mock.timers.tick(0);

  // 1-LSB room noise (level 129 -> RMS*3.2 = 0.025) must NEVER falsely kill Chrome Web Speech.
  recorder.setLevel(129);
  await recorder.tick(6_000);
  assert.equal(instances[0].aborted, false, "room tone did not trigger false fallback");
  assert.equal(recorder.recorders.length, 0);

  // Sustained real speech (level 146 -> 0.45) with zero Web Speech results triggers fallback after ~3s.
  recorder.speak();
  await recorder.tick(3_120);
  assert.equal(instances[0].aborted, true);
  assert.equal(recorder.recorders.length, 1, "watchdog switched to clip fallback after sustained uncaptured speech");
  assert.equal(updates.at(-1)?.engine, "clips");
  stop();
});

test("non-default microphone skips Web Speech API and starts clip preview immediately", async (t) => {
  const recorder = stubRecorder(t);
  const instances = stubSpeechRecognition(t);
  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview), { useSystemMic: false });
  t.mock.timers.tick(0);
  assert.equal(instances.length, 0);
  assert.equal(recorder.recorders.length, 1);
  assert.equal(updates.at(-1)?.engine, "clips");
  stop();
});

test("Brave skips broken Web Speech API and starts fast clip preview immediately", async (t) => {
  const recorder = stubRecorder(t);
  const instances = stubSpeechRecognition(t);
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { brave: {}, userAgent: "Chrome" } });
  t.after(() => {
    if (navDesc) Object.defineProperty(globalThis, "navigator", navDesc);
    else Reflect.deleteProperty(globalThis, "navigator");
  });

  const updates: LivePreview[] = [];
  const stop = startLiveTranscription(recorder.source, "en", "", (preview) => updates.push(preview));
  t.mock.timers.tick(0);
  assert.equal(instances.length, 0, "never invokes webkitSpeechRecognition on Brave");
  assert.equal(recorder.recorders.length, 1, "starts clip recorder immediately");
  assert.equal(updates.at(-1)?.engine, "clips");
  stop();
});
