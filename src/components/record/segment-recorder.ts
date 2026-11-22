"use client";

/**
 * Records a MediaStream as a series of standalone audio files ("segments").
 * A new MediaRecorder starts every `segmentMs` of recorded time, so long recordings
 * become independent files that each fit within the transcription API's limits.
 */

export interface SegmentInfo {
  index: number;
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

export interface SegmentRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond: number;
  segmentMs: number;
  maxMs: number;
  timesliceMs: number;
}

export interface SegmentRecorderCallbacks {
  onChunk?: (segment: number, seq: number, blob: Blob) => void;
  onSegment?: (info: SegmentInfo) => void;
  /** The maximum recording length was reached; the caller should stop. */
  onLimit?: () => void;
  onError?: (error: Error) => void;
}

interface ActiveSegment {
  index: number;
  recorder: MediaRecorder;
  chunks: Blob[];
  seq: number;
  activeMs: number;
  resumedAt: number | null;
  finalMs: number;
  stopped: Promise<SegmentInfo>;
}

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

async function withDuration(info: SegmentInfo): Promise<SegmentInfo> {
  if (!info.mimeType.includes("webm")) return info;
  try {
    // Browser WebM files have no duration header, which breaks seeking; add it.
    const mod = (await import("fix-webm-duration")) as unknown as {
      default: (blob: Blob, duration: number, options?: { logger?: false }) => Promise<Blob>;
    };
    return { ...info, blob: await mod.default(info.blob, info.durationMs, { logger: false }) };
  } catch {
    return info;
  }
}

export class SegmentedRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "";

  private readonly stream: MediaStream;
  private readonly options: SegmentRecorderOptions;
  private readonly callbacks: SegmentRecorderCallbacks;
  private current: ActiveSegment | null = null;
  private finished: SegmentInfo[] = [];
  private finalizing: Promise<SegmentInfo>[] = [];
  private nextIndex = 0;
  private completedMs = 0;
  private rotationBroken = false;
  private discarded = false;

  constructor(stream: MediaStream, options: SegmentRecorderOptions, callbacks: SegmentRecorderCallbacks = {}) {
    this.stream = stream;
    this.options = options;
    this.callbacks = callbacks;
  }

  start(): void {
    this.current = this.openSegment();
    this.state = "recording";
  }

  get elapsedMs(): number {
    const current = this.current;
    if (!current) return this.completedMs;
    const live = current.resumedAt !== null ? performance.now() - current.resumedAt : 0;
    return this.completedMs + current.activeMs + live;
  }

  pause(): void {
    const current = this.current;
    if (!current || this.state !== "recording") return;
    current.recorder.pause();
    if (current.resumedAt !== null) current.activeMs += performance.now() - current.resumedAt;
    current.resumedAt = null;
    this.state = "paused";
  }

  resume(): void {
    const current = this.current;
    if (!current || this.state !== "paused") return;
    current.recorder.resume();
    current.resumedAt = performance.now();
    this.state = "recording";
  }

  /** Stops recording and resolves with every segment, in order. */
  async stop(): Promise<SegmentInfo[]> {
    if (this.current) {
      this.closeSegment(this.current);
      this.current = null;
    }
    this.state = "inactive";
    await Promise.allSettled(this.finalizing);
    return [...this.finished].sort((a, b) => a.index - b.index);
  }

  /** Stops without producing segments (used by "Restart"). */
  discard(): void {
    this.discarded = true;
    const current = this.current;
    this.current = null;
    this.state = "inactive";
    if (current && current.recorder.state !== "inactive") current.recorder.stop();
  }

  private openSegment(): ActiveSegment {
    const recorder = new MediaRecorder(this.stream, {
      audioBitsPerSecond: this.options.audioBitsPerSecond,
      ...(this.options.mimeType ? { mimeType: this.options.mimeType } : {}),
    });
    const segment = {
      index: this.nextIndex++,
      recorder,
      chunks: [] as Blob[],
      seq: 0,
      activeMs: 0,
      resumedAt: performance.now(),
      finalMs: 0,
    } as ActiveSegment;

    segment.stopped = new Promise<SegmentInfo>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0 || this.discarded) return;
        segment.chunks.push(event.data);
        this.callbacks.onChunk?.(segment.index, segment.seq++, event.data);
        if (segment === this.current) this.checkLimits();
      };
      recorder.onstop = () => {
        const mimeType = (recorder.mimeType || this.options.mimeType || "audio/webm").split(";")[0];
        resolve({ index: segment.index, blob: new Blob(segment.chunks, { type: mimeType }), durationMs: segment.finalMs, mimeType });
      };
      recorder.onerror = () => {
        const error = new Error("Recording stopped because of a microphone error.");
        this.callbacks.onError?.(error);
        reject(error);
      };
    });

    recorder.start(this.options.timesliceMs);
    this.mimeType = (recorder.mimeType || this.options.mimeType || "audio/webm").split(";")[0];
    return segment;
  }

  private closeSegment(segment: ActiveSegment): void {
    if (segment.resumedAt !== null) segment.activeMs += performance.now() - segment.resumedAt;
    segment.resumedAt = null;
    segment.finalMs = Math.round(segment.activeMs);
    this.completedMs += segment.activeMs;
    const finalize = segment.stopped.then(async (info) => {
      const fixed = await withDuration(info);
      if (fixed.blob.size > 0 && !this.discarded) {
        this.finished.push(fixed);
        this.callbacks.onSegment?.(fixed);
      }
      return fixed;
    });
    this.finalizing.push(finalize);
    if (segment.recorder.state !== "inactive") segment.recorder.stop();
  }

  private checkLimits(): void {
    const current = this.current;
    if (!current || this.state !== "recording") return;
    if (this.elapsedMs >= this.options.maxMs) {
      this.callbacks.onLimit?.();
      return;
    }
    const segmentMs = current.activeMs + (current.resumedAt !== null ? performance.now() - current.resumedAt : 0);
    if (!this.rotationBroken && segmentMs >= this.options.segmentMs) {
      try {
        // Start the next file before stopping this one, so no audio falls in between.
        const next = this.openSegment();
        this.current = next;
        this.closeSegment(current);
      } catch {
        // Keep recording into the current file; the server splits long files if needed.
        this.rotationBroken = true;
      }
    }
  }
}
