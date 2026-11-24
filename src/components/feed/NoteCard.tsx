"use client";

import Link from "next/link";
import { Check, MonitorSpeaker, Sparkles, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatDuration, formatNoteTimestamp } from "@/lib/format";
import { SPRING_SNAPPY, TAP_ICON } from "@/lib/motion";
import type { NoteListItem, SortMode } from "@/lib/types";
import { TagDot } from "../ui";

interface NoteCardProps {
  note: NoteListItem;
  sortBy: SortMode;
  selectionOrder?: number | null;
  selecting: boolean;
  onToggleSelect: () => void;
}

function CardSkeletonLines({ pulse = false }: { pulse?: boolean }) {
  return (
    <div aria-hidden="true" className={`mt-3 space-y-2.5 ${pulse ? "animate-pulse" : ""}`}>
      <div className="h-3.5 w-1/2 rounded-full bg-[var(--border)]/75" />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 h-3 rounded-full bg-[var(--border)]/60" />
        <div className="h-3 rounded-full bg-[var(--border)]/50" />
      </div>
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-3 h-3 rounded-full bg-[var(--border)]/60" />
        <div className="col-span-2 h-3 rounded-full bg-[var(--border)]/45" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-2 h-3 rounded-full bg-[var(--border)]/55" />
        <div className="col-span-1 h-3 rounded-full bg-[var(--border)]/45" />
      </div>
      <div className="grid grid-cols-6 gap-2">
        <div className="col-span-1 h-3 rounded-full bg-[var(--border)]/50" />
        <div className="col-span-2 h-3 rounded-full bg-[var(--border)]/45" />
        <div className="col-span-1 h-3 rounded-full bg-[var(--border)]/40" />
      </div>
    </div>
  );
}

export function NoteCard({ note, sortBy, selectionOrder = null, selecting, onToggleSelect }: NoteCardProps) {
  const processing = note.status === "processing" || note.status === "uploading";
  const failed = note.status === "failed";
  const selected = selectionOrder !== null && selectionOrder > 0;
  const timestamp = sortBy === "createdAt" ? note.createdAt : note.updatedAt;

  return (
    <div className="group relative rounded-[1.75rem]">
      <Link
        href={`/notes/${note.id}`}
        onClick={(event) => {
          if (selecting) {
            event.preventDefault();
            onToggleSelect();
          }
        }}
        className={`flex h-[14.5rem] flex-col overflow-hidden rounded-[1.75rem] bg-[var(--surface)]/92 p-6 shadow-[0_2px_16px_rgba(1,5,15,0.06)] backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-in-out)] hover:bg-[var(--surface-hover)]/95 active:scale-[0.992] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.28)] ${
          selected
            ? "border-[1.5px] border-[var(--brand)] ring-1 ring-[var(--brand)]"
            : "border border-[var(--border)] hover:border-[var(--border-strong)]"
        }`}
      >
        {failed ? (
          <>
            <div className="flex items-center gap-2 pr-8 text-[0.9375rem]/5 font-medium text-[var(--ink-muted)]">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white" aria-hidden="true">
                !
              </span>
              <span>Error</span>
            </div>
            <CardSkeletonLines />
            <p className="mt-auto line-clamp-1 text-xs text-[var(--danger)]">
              {note.error || "Couldn't transcribe. Open to retry."}
            </p>
          </>
        ) : processing ? (
          <>
            <div className="flex items-center gap-2 pr-8 text-[0.9375rem]/5 font-medium text-[var(--brand)]">
              <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-[var(--brand)]" aria-hidden="true" />
              <span>{note.status === "uploading" ? "Uploading audio…" : note.stage || "Transcribing…"}</span>
            </div>
            <CardSkeletonLines pulse />
            {typeof note.progress === "number" && (
              <div className="mt-auto progress-track">
                <div className="progress-bar" style={{ width: `${Math.max(8, Math.round(note.progress * 100))}%` }} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 pr-8 text-[0.9375rem]/5 text-[var(--ink-muted)]">
              <span className="truncate">{formatNoteTimestamp(timestamp)}</span>
              {note.durationSec ? <span className="shrink-0 text-xs">· {formatDuration(note.durationSec)}</span> : null}
              {note.source === "meeting" && (
                <span title="Meeting recording" className="inline-flex shrink-0 items-center">
                  <MonitorSpeaker className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              {note.speakers && (
                <span title="Multi-speaker" className="inline-flex shrink-0 items-center">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              {note.rewriteCount > 0 && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--brand-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]"
                  title="Rewrites"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  {note.rewriteCount}
                </span>
              )}
            </div>

            <h3 className="mt-1.5 line-clamp-2 text-[1.25rem]/[1.25] font-semibold tracking-[-0.015em] text-[var(--ink)]">
              {note.title || "Untitled note"}
            </h3>

            <p className="mt-1.5 line-clamp-5 whitespace-pre-wrap text-[1.03125rem]/[1.45] text-[var(--ink-body)]">
              {note.preview || "Empty note"}
            </p>

            {note.tags.length > 0 && (
              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {note.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex max-w-[7.5rem] shrink-0 items-center gap-1 truncate rounded-full bg-[var(--surface-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-subtle)]"
                  >
                    <TagDot color={tag.color} />
                    <span className="truncate">{tag.title}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Link>

      <motion.button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select "${note.title || "Untitled note"}"`}
        onClick={onToggleSelect}
        whileHover={{ scale: 1.1 }}
        whileTap={TAP_ICON}
        transition={SPRING_SNAPPY}
        className={`absolute right-5 top-5 flex cursor-pointer items-center justify-center rounded-full transition-[opacity,background-color,border-color] duration-200 ${
          selected
            ? "h-[25px] w-[25px] bg-[var(--brand)] text-xs font-semibold text-white opacity-100"
            : `h-5 w-5 border-[1.5px] border-[var(--ash-400)] bg-[var(--surface)]/90 text-[var(--ash-400)] ${
                selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`
        }`}
      >
        <AnimatePresence initial={false} mode="wait">
          {selected ? (
            <motion.span
              key={selectionOrder}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={SPRING_SNAPPY}
              className="inline-flex items-center justify-center tabular-nums leading-none"
            >
              {selectionOrder ?? <Check className="h-3 w-3" strokeWidth={2.75} />}
            </motion.span>
          ) : (
            <Check className="h-3 w-3 opacity-0 transition-opacity hover:opacity-70" strokeWidth={2.4} />
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
