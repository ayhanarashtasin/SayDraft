"use client";

export interface AudioSource {
  /** Mono mix of the microphone (and shared tab/system audio in meeting mode). */
  stream: MediaStream;
  analyser: AnalyserNode;
  ready: Promise<void>;
  sharing: boolean;
  setMicrophone: (deviceId: string) => Promise<void>;
  startSharing: () => Promise<boolean>;
  stopSharing: () => void;
  close: () => void;
}

export class AudioSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioSourceError";
  }
}

function describeMediaError(error: unknown, display: boolean): Error {
  const name = error instanceof DOMException ? error.name : "";
  if (error instanceof AudioSourceError) return error;
  if (display) {
    if (name === "NotAllowedError") return new AudioSourceError("Screen sharing was cancelled or blocked. Try sharing again.");
    if (name === "InvalidStateError") return new AudioSourceError("Click the recording or Meeting button again to start sharing.");
    return new AudioSourceError("Could not share audio from that tab or screen. Try another one.");
  }
  if (name === "NotAllowedError") {
    return new AudioSourceError("Microphone access was blocked. Allow it in your browser's site settings, then try again.");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new AudioSourceError("No microphone was found. Connect one or pick another microphone.");
  }
  if (name === "NotReadableError") {
    return new AudioSourceError("Your microphone is busy or unavailable. Close other apps that use it and try again.");
  }
  return new AudioSourceError("Could not start recording. Check your microphone and try again.");
}

function stopTracks(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Opens the microphone (plus a shared tab or screen with audio for meetings) and mixes
 * everything into one mono stream for recording, with an analyser for the level meter.
 */
export function openAudioSource(options: { deviceId: string; meeting: boolean; onDisplayEnded?: () => void }): AudioSource {
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new AudioSourceError("Recording needs a recent browser and a secure page (http://localhost or https).");
  }
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  destination.channelCount = 1;
  destination.channelCountMode = "explicit";
  destination.channelInterpretation = "speakers";
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  let mic: MediaStreamAudioSourceNode | null = null;
  let display: MediaStreamAudioSourceNode | null = null;
  let displayRequest = 0;
  let closed = false;

  function connect(stream: MediaStream) {
    const node = context.createMediaStreamSource(stream);
    node.connect(destination);
    node.connect(analyser);
    return node;
  }

  async function setMicrophone(deviceId: string) {
    let stream: MediaStream | undefined;
    try {
      stream = await devices.getUserMedia({
        audio: {
          ...(deviceId !== "auto" ? { deviceId: { exact: deviceId } } : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (closed) {
        stopTracks(stream);
        return;
      }
      const next = connect(stream);
      mic?.disconnect();
      stopTracks(mic?.mediaStream);
      mic = next;
    } catch (error) {
      stopTracks(stream);
      throw describeMediaError(error, false);
    }
  }

  function stopSharing() {
    displayRequest += 1;
    const node = display;
    display = null;
    node?.disconnect();
    node?.mediaStream.getTracks().forEach((track) => {
      track.removeEventListener("ended", displayEnded);
      track.stop();
    });
  }

  function displayEnded() {
    if (!display) return;
    stopSharing();
    options.onDisplayEnded?.();
  }

  async function startSharing() {
    if (display) return true;
    if (!devices.getDisplayMedia) throw new AudioSourceError("This browser can't capture tab or system audio. Use Chrome or Edge.");
    const request = ++displayRequest;
    let stream: MediaStream | undefined;
    try {
      stream = await devices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
      if (closed || request !== displayRequest) {
        stopTracks(stream);
        return false;
      }
      if (stream.getAudioTracks().length === 0) {
        throw new AudioSourceError("No audio was shared. Share again and turn on \"Share tab audio\" or \"Share system audio\".");
      }
      const tracks = stream.getTracks();
      if (tracks.some((track) => track.readyState === "ended")) {
        throw new AudioSourceError("Screen sharing ended. Share again to capture meeting audio.");
      }
      display = connect(stream);
      for (const track of tracks) {
        // Keep the video track for detecting when sharing stops.
        if (track.kind === "video") track.enabled = false;
        track.addEventListener("ended", displayEnded, { once: true });
      }
      return true;
    } catch (error) {
      stopTracks(stream);
      throw describeMediaError(error, true);
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    stopSharing();
    stopTracks(mic?.mediaStream);
    stopTracks(destination.stream);
    void context.close().catch(() => undefined);
  }

  const ready = (async () => {
    try {
      // Display capture must be requested from the click before awaiting the microphone.
      if (options.meeting && !(await startSharing())) return;
      if (closed) return;
      await setMicrophone(options.deviceId);
      if (context.state === "suspended") await context.resume();
    } catch (error) {
      close();
      throw error;
    }
  })();
  return {
    stream: destination.stream,
    analyser,
    ready,
    get sharing() { return display !== null; },
    setMicrophone,
    startSharing,
    stopSharing,
    close,
  };
}

/** Current input level between 0 and 1. */
export function readLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (const value of buffer) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
}

/** Normalized 4-band speech energy [0..1] for the 4-bar recorder visualizer. */
export function readFourBands(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): [number, number, number, number] {
  analyser.getByteFrequencyData(buffer);
  const bands: [number, number][] = [
    [1, 6],
    [6, 16],
    [16, 32],
    [32, 60],
  ];
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < bands.length; i += 1) {
    const [start, end] = bands[i];
    let peak = 0;
    let total = 0;
    const limit = Math.min(end, buffer.length);
    for (let j = start; j < limit; j += 1) {
      const v = buffer[j] / 255;
      total += v;
      if (v > peak) peak = v;
    }
    const avg = limit > start ? total / (limit - start) : 0;
    out[i] = Math.min(1, Math.max(avg * 1.45, peak * 0.9));
  }
  return out;
}
