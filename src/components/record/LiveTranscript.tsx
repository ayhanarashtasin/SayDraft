"use client";

import { type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { AudioSource } from "./audio-source";
import { type LivePreview, joinTranscript, startLiveTranscription, transcriptSeparator } from "./live-transcription";

export type LiveTranscriptPhase = "idle" | "starting" | "recording" | "paused" | "stopping" | "uploading" | "failed";

export function useLiveTranscript(
  sourceRef: RefObject<AudioSource | null>,
  sessionId: string | null,
  enabled: boolean,
  language: string,
  micId: string,
  useSystemMic: boolean,
) {
  const closeRef = useRef<(() => void) | undefined>(undefined);
  const latest = useRef<(LivePreview & { sessionId: string }) | null>(null);
  const [preview, setPreview] = useState<typeof latest.current>(null);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    closeRef.current?.();
    closeRef.current = undefined;
  }, []);

  useEffect(() => {
    const source = sourceRef.current;
    if (!enabled || !sessionId || !source || source.sharing) return;
    const previous = latest.current?.sessionId === sessionId
      ? joinTranscript(latest.current.text, latest.current.interim)
      : "";
    closeRef.current = startLiveTranscription(
      source,
      language,
      previous,
      (update) => {
        const next = { ...update, sessionId };
        latest.current = next;
        setPreview(next);
      },
      { useSystemMic },
    );
    return stop;
  }, [attempt, enabled, language, micId, sessionId, sourceRef, stop, useSystemMic]);

  return { preview: preview?.sessionId === sessionId ? preview : null, stop, retry: () => setAttempt((value) => value + 1) };
}

export function LiveTranscript({
  preview,
  active,
  phase,
}: {
  preview: LivePreview | null;
  active: boolean;
  phase: LiveTranscriptPhase;
}) {
  const headingId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const autoScrollingRef = useRef(false);
  const [following, setFollowing] = useState(true);
  const text = preview?.text ?? "";
  const interim = preview?.interim ?? "";
  const hasText = Boolean(text || interim);
  const unavailable = preview?.status === "unavailable";
  const delayed = preview?.status === "delayed";
  const finishing = phase === "stopping" || phase === "uploading" || phase === "failed";
  const preRecord = phase === "idle" || phase === "starting";
  const paused = phase === "paused";
  const listening = active && !unavailable && !delayed;

  const status = phase === "stopping" || phase === "uploading"
    ? "Saving…"
    : unavailable
      ? "Unavailable"
      : paused
        ? "Paused"
        : !active
          ? "Preview"
          : delayed
            ? "Delayed"
            : "Listening…";

  const dotClass = listening
    ? "bg-[var(--record-live)] pulse-dot"
    : delayed
      ? "bg-[var(--warning)]"
      : unavailable
        ? "bg-[var(--danger)]"
        : paused
          ? "bg-[var(--ink-muted)]"
          : null;

  const pinToBottom = useCallback(() => {
    const panel = scrollRef.current;
    if (!panel) return;
    autoScrollingRef.current = true;
    panel.scrollTop = panel.scrollHeight;
    requestAnimationFrame(() => {
      autoScrollingRef.current = false;
    });
  }, []);

  useLayoutEffect(() => {
    if (followRef.current) pinToBottom();
  }, [text, interim, pinToBottom]);

  const emptyMessage = preRecord
    ? "Your words will appear here as you speak."
    : unavailable
      ? "No live preview for this recording."
      : finishing
        ? "No live preview was captured."
        : paused
          ? "Resume recording to continue the preview."
          : "Start speaking to see text here.";

  const footerMessage = preview?.message
    ? `${preview.message} You can still save your recording.`
    : finishing
      ? phase === "failed"
        ? "Your recording is saved below so you can try again."
        : "Generating the final transcript from your full recording…"
      : preview?.engine === "clips"
        ? "Live preview is updating in short clips. Final transcript is generated when you stop."
        : preview?.engine === "speech"
          ? "Live preview uses your browser’s speech recognition. Final transcript is generated when you stop."
          : "Live preview appears as you speak. Final transcript is generated when you stop.";

  return (
    <div className="w-full max-w-md text-left sm:max-w-xl">
      <div className="relative flex h-[15rem] flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-panel)] sm:h-[18rem]">
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-[var(--border)] px-4 py-3">
          <h2 id={headingId} className="text-sm font-semibold text-[var(--ink)]">Live transcript</h2>
          <span role="status" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-subtle)]">
            {dotClass && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />}
            {status}
          </span>
        </div>
        <div
          ref={scrollRef}
          role="region"
          aria-labelledby={headingId}
          tabIndex={0}
          onScroll={(event) => {
            if (autoScrollingRef.current) return;
            const panel = event.currentTarget;
            const atBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 24;
            followRef.current = atBottom;
            setFollowing((prev) => (prev === atBottom ? prev : atBottom));
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-2xl px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
        >
          {hasText ? (
            <p dir="auto" className="whitespace-pre-wrap text-start text-sm leading-relaxed text-[var(--ink)] [overflow-wrap:anywhere]">
              {text}
              {text && interim ? transcriptSeparator(text, interim) : null}
              {interim ? <span className={active ? "italic text-[var(--ink-subtle)]" : undefined}>{interim}</span> : null}
              {listening && (
                <span aria-hidden="true" className="pulse-dot ml-1 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-[var(--brand)]" />
              )}
            </p>
          ) : (
            <p className="text-sm text-[var(--ink-subtle)]">{emptyMessage}</p>
          )}
        </div>
        {!following && hasText && (
          <button
            type="button"
            onClick={() => {
              followRef.current = true;
              setFollowing(true);
              pinToBottom();
            }}
            className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/95 px-2.5 py-1 text-xs font-semibold text-[var(--ink)] shadow-sm backdrop-blur-sm transition-opacity hover:opacity-85"
          >
            <ArrowDown className="h-3 w-3" aria-hidden="true" /> Latest
          </button>
        )}
      </div>
      <p aria-live={preview?.message ? "polite" : undefined} className="mt-2 text-xs text-[var(--ink-subtle)]">
        {footerMessage}
      </p>
    </div>
  );
}
