"use client";

export interface AudioSource {
  /** Mono mix of the microphone (and shared tab/system audio in meeting mode). */
  stream: MediaStream;
  analyser: AnalyserNode;
  close: () => void;
}

export class AudioSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioSourceError";
  }
}

function describeMediaError(error: unknown, meeting: boolean): Error {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return new AudioSourceError(
      meeting
        ? "Screen or microphone access was blocked. Allow it in your browser and try again."
        : "Microphone access was blocked. Allow it in your browser's site settings, then try again.",
    );
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new AudioSourceError("No microphone was found. Connect one or pick another microphone.");
  }
  if (name === "NotReadableError") {
    return new AudioSourceError("Your microphone is busy or unavailable. Close other apps that use it and try again.");
  }
  if (error instanceof AudioSourceError) return error;
  return new AudioSourceError("Could not start recording. Check your microphone and try again.");
}

/**
 * Opens the microphone (plus a shared tab or screen with audio for meetings) and mixes
 * everything into one mono stream for recording, with an analyser for the level meter.
 */
export async function openAudioSource(options: { deviceId: string; meeting: boolean; onDisplayEnded?: () => void }): Promise<AudioSource> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new AudioSourceError("Recording needs a recent browser and a secure page (http://localhost or https).");
  }
  const streams: MediaStream[] = [];
  const stopAll = () => streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(options.deviceId !== "auto" ? { deviceId: { exact: options.deviceId } } : {}),
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streams.push(mic);

    let display: MediaStream | null = null;
    if (options.meeting) {
      if (!navigator.mediaDevices.getDisplayMedia) throw new AudioSourceError("This browser can't capture tab or system audio. Use Chrome or Edge.");
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
      streams.push(display);
      if (display.getAudioTracks().length === 0) {
        throw new AudioSourceError("No audio was shared. Share again and turn on \"Share tab audio\" or \"Share system audio\".");
      }
      // Only the audio is needed; pause the video track to save CPU.
      display.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      display.getAudioTracks()[0].addEventListener("ended", () => options.onDisplayEnded?.(), { once: true });
    }

    const context = new AudioContext();
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 1;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "speakers";
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;

    const micNode = context.createMediaStreamSource(mic);
    micNode.connect(destination);
    micNode.connect(analyser);
    if (display) {
      const displayNode = context.createMediaStreamSource(new MediaStream(display.getAudioTracks()));
      displayNode.connect(destination);
      displayNode.connect(analyser);
    }

    return {
      stream: destination.stream,
      analyser,
      close: () => {
        stopAll();
        destination.stream.getTracks().forEach((track) => track.stop());
        void context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    stopAll();
    throw describeMediaError(error, options.meeting);
  }
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
