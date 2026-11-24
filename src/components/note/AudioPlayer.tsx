"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatCountdown } from "@/lib/format";
import type { AudioFile } from "@/lib/types";
import { PauseBarsIcon, PlayTriangleIcon, SkipBack15Icon, SkipForward15Icon } from "../icons";

const RATES = [1, 1.25, 1.5, 2, 0.75];

/** Two-row blush AudioPlayer matching Letterly's expandable note player. */
export function AudioPlayer({
  noteId,
  files,
  autoPlay = false,
  onClose,
}: {
  noteId: number;
  files: AudioFile[];
  autoPlay?: boolean;
  onClose?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  const [measured, setMeasured] = useState<Record<number, number>>({});
  const [failed, setFailed] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const resumeAfterLoad = useRef(autoPlay);

  const safeIndex = Math.min(index, Math.max(files.length - 1, 0));
  const file = files[safeIndex];
  const durations = useMemo(() => files.map((item) => measured[item.id] ?? item.durationSec ?? 0), [files, measured]);
  const offsets = useMemo(() => durations.map((_, i) => durations.slice(0, i).reduce((sum, value) => sum + value, 0)), [durations]);
  const total = durations.reduce((sum, value) => sum + value, 0);
  const globalTime = (offsets[safeIndex] ?? 0) + position;
  const pct = total > 0 ? Math.min(100, Math.max(0, (globalTime / total) * 100)) : 0;

  useEffect(() => {
    if (index > files.length - 1) setIndex(0);
  }, [files.length, index]);

  useEffect(() => {
    if (autoPlay && audioRef.current && audioRef.current.paused) {
      void audioRef.current.play().catch(() => undefined);
    }
  }, [autoPlay]);

  if (!file) return null;

  function seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, Math.max(total - 0.05, 0)));
    let next = files.length - 1;
    for (let i = 0; i < files.length; i += 1) {
      if (target < offsets[i] + durations[i]) {
        next = i;
        break;
      }
    }
    const local = Math.max(0, target - offsets[next]);
    const audio = audioRef.current;
    if (next === safeIndex && audio) {
      audio.currentTime = local;
      setPosition(local);
    } else {
      pendingSeek.current = local;
      resumeAfterLoad.current = playing;
      setPosition(local);
      setIndex(next);
    }
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  }

  function handleScrubPointer(clientX: number) {
    if (!trackRef.current || !total) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(ratio * total);
  }

  return (
    <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-panel)] px-4 py-3">
      <audio
        ref={audioRef}
        key={file.id}
        src={`/api/notes/${noteId}/audio/${file.id}`}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          audio.playbackRate = rate;
          setFailed(false);
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setMeasured((current) => (current[file.id] === audio.duration ? current : { ...current, [file.id]: audio.duration }));
          }
          if (pendingSeek.current !== null) {
            audio.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
          if (resumeAfterLoad.current) {
            resumeAfterLoad.current = false;
            void audio.play().catch(() => undefined);
          }
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        onEnded={() => {
          if (safeIndex < files.length - 1) {
            resumeAfterLoad.current = true;
            setPosition(0);
            setIndex(safeIndex + 1);
          } else {
            setPlaying(false);
          }
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-[4.5rem] items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
              setRate(next);
              if (audioRef.current) audioRef.current.playbackRate = next;
            }}
            aria-label="Playback speed"
            className="cursor-pointer rounded-full px-2 py-1 text-xs font-semibold tabular-nums text-[var(--ink-subtle)] transition-colors hover:bg-[var(--surface-panel-card)] hover:text-[var(--ink)]"
          >
            {rate}×
          </button>
          {files.length > 1 && (
            <span className="text-[11px] font-medium text-[var(--ink-muted)]">
              {safeIndex + 1}/{files.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => seek(globalTime - 15)}
            aria-label="Back 15 seconds"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
          >
            <SkipBack15Icon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause audio" : "Play note audio"}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
          >
            {playing ? <PauseBarsIcon className="h-5 w-5" /> : <PlayTriangleIcon className="ml-0.5 h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => seek(globalTime + 15)}
            aria-label="Forward 15 seconds"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
          >
            <SkipForward15Icon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex min-w-[4.5rem] items-center justify-end">
          {onClose && (
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                onClose();
              }}
              aria-label="Close audio player"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--ink-subtle)] transition-opacity hover:opacity-65"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="w-11 text-left text-xs font-medium tabular-nums text-[var(--ink-muted)]">{formatCountdown(globalTime)}</span>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek audio"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(globalTime)}
          onClick={(event) => handleScrubPointer(event.clientX)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") seek(globalTime - 5);
            if (event.key === "ArrowRight") seek(globalTime + 5);
          }}
          className="group relative flex h-4 flex-1 cursor-pointer items-center"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border-strong)]/60 transition-[height] duration-150 group-hover:h-2">
            <div className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-75" style={{ width: `${pct}%` }} />
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--ink)] opacity-0 shadow-xs transition-opacity duration-150 group-hover:opacity-100"
            style={{ left: `${pct}%` }}
          />
        </div>
        <span className="w-11 text-right text-xs font-medium tabular-nums text-[var(--ink-muted)]">{formatCountdown(total)}</span>
      </div>

      {failed && (
        <p className="mt-2 text-center text-xs text-[var(--danger)]">
          Your browser couldn&apos;t play this recording directly — use Download to listen.
        </p>
      )}
    </div>
  );
}
