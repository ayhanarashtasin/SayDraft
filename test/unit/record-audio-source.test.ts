import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openAudioSource } from "../../src/components/record/audio-source.ts";

class Track extends EventTarget {
  readonly kind: "audio" | "video";
  readyState = "live";
  enabled = true;

  constructor(kind: Track["kind"]) {
    super();
    this.kind = kind;
  }

  stop() {
    this.readyState = "ended";
  }
}

function stream(...tracks: Track[]) {
  return { getTracks: () => tracks, getAudioTracks: () => tracks.filter((track) => track.kind === "audio") };
}

function stubMedia(t: TestContext, mediaDevices: object) {
  class AudioContextStub {
    state = "running";
    createMediaStreamDestination = () => ({ stream: stream(new Track("audio")) });
    createAnalyser = () => ({});
    createMediaStreamSource = (mediaStream: ReturnType<typeof stream>) => ({ mediaStream, connect() {}, disconnect() {} });
    async close() {}
  }

  for (const [target, key, value] of [
    [navigator, "mediaDevices", mediaDevices],
    [globalThis, "AudioContext", AudioContextStub],
    [globalThis, "MediaRecorder", class {}],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    });
  }
}

test("meeting requests screen sharing before the mic and handles either track ending once", async (t) => {
  for (const first of ["video", "audio"] as const) {
    await t.test(first, async (t) => {
      const audio = new Track("audio");
      const video = new Track("video");
      const capture = Promise.withResolvers<ReturnType<typeof stream>>();
      const calls: string[] = [];
      stubMedia(t, {
        getDisplayMedia() { calls.push("display"); return capture.promise; },
        async getUserMedia() { calls.push("mic"); return stream(new Track("audio")); },
      });
      let ended = 0;
      const source = openAudioSource({ deviceId: "auto", meeting: true, onDisplayEnded: () => { ended += 1; } });
      assert.deepEqual(calls, ["display"]);
      capture.resolve(stream(audio, video));
      await source.ready;
      assert.deepEqual(calls, ["display", "mic"]);
      assert.equal(video.enabled, false);
      const tracks = first === "video" ? [video, audio] : [audio, video];
      tracks.forEach((track) => track.dispatchEvent(new Event("ended")));
      assert.equal(ended, 1);
      assert.ok(tracks.every((track) => track.readyState === "ended"));
      source.close();
    });
  }
});

test("a live mic switch keeps the output stream and releases the old mic only on success", async (t) => {
  const original = new Track("audio");
  const replacement = new Track("audio");
  stubMedia(t, {
    async getUserMedia({ audio }: { audio: { deviceId?: { exact: string } } }) {
      if (audio.deviceId?.exact === "missing") throw new DOMException("Device not found", "NotFoundError");
      return stream(audio.deviceId ? replacement : original);
    },
  });
  const source = openAudioSource({ deviceId: "auto", meeting: false });
  await source.ready;
  const output = source.stream;
  await assert.rejects(source.setMicrophone("missing"), /No microphone/);
  assert.equal(original.readyState, "live");
  await source.setMicrophone("external");
  assert.equal(original.readyState, "ended");
  assert.equal(source.stream, output);
  source.close();
  assert.equal(replacement.readyState, "ended");
});
