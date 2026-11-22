"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { AudioFile } from "@/lib/types";

const RATES = [1, 1.25, 1.5, 2, 0.75];

/** Plays a note's audio files back to back on one timeline (long recordings are stored in parts). */
export function AudioPlayer({ noteId, files }: { noteId: number; files: AudioFile[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  const [measured, setMeasured] = useState<Record<number, number>>({});
  const [failed, setFailed] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const resumeAfterLoad = useRef(false);

  const safeIndex = Math.min(index, Math.max(files.length - 1, 0));
  const file = files[safeIndex];
  const durations = useMemo(() => files.map((item) => measured[item.id] ?? item.durationSec ?? 0), [files, measured]);
  const offsets = useMemo(() => durations.map((_, i) => durations.slice(0, i).reduce((sum, value) => sum + value, 0)), [durations]);
  const total = durations.reduce((sum, value) => sum + value, 0);
  const globalTime = (offsets[safeIndex] ?? 0) + position;

  useEffect(() => {
    if (index > files.length - 1) setIndex(0);
  }, [files.length, index]);

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

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
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
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause audio" : "Play note audio"}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-opacity hover:opacity-80"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <button type="button" onClick={() => seek(globalTime - 15)} aria-label="Back 15 seconds" className="icon-btn h-8 w-8">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => seek(globalTime + 15)} aria-label="Forward 15 seconds" className="icon-btn h-8 w-8">
          <RotateCw className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <span className="w-12 text-right font-mono text-xs tabular-nums text-[var(--ink-muted)]">{formatDuration(globalTime)}</span>
          <input
            type="range"
            min={0}
            max={total || 0}
            step={0.1}
            value={Math.min(globalTime, total || 0)}
            disabled={!total}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
            className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--brand)]"
          />
          <span className="w-12 font-mono text-xs tabular-nums text-[var(--ink-muted)]">{formatDuration(total)}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
            setRate(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          aria-label="Playback speed"
          className="btn btn-ghost btn-sm w-12 px-0 font-mono"
        >
          {rate}×
        </button>
        <a href={`/api/notes/${noteId}/audio-export`} download aria-label="Download audio" title="Download audio" className="icon-btn h-8 w-8">
          <Download className="h-4 w-4" />
        </a>
      </div>
      {(files.length > 1 || failed) && (
        <p className="mt-1.5 px-1 text-xs text-[var(--ink-muted)]">
          {failed ? "Your browser couldn't play this recording directly — download it to listen." : `Part ${safeIndex + 1} of ${files.length}`}
        </p>
      )}
    </div>
  );
}
