"use client";

import Link from "next/link";
import { AlertCircle, Archive, ArchiveRestore, Check, MonitorSpeaker, Sparkles, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatDuration, formatTime } from "@/lib/format";
import { SPRING_SNAPPY, TAP_ICON } from "@/lib/motion";
import type { NoteListItem, SortMode } from "@/lib/types";
import { Spinner, TagDot } from "../ui";

interface NoteCardProps {
  note: NoteListItem;
  sortBy: SortMode;
  selected: boolean;
  selecting: boolean;
  onToggleSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function NoteCard({ note, sortBy, selected, selecting, onToggleSelect, onArchive, onDelete }: NoteCardProps) {
  const processing = note.status === "processing" || note.status === "uploading";
  const timestamp = sortBy === "createdAt" ? note.createdAt : note.updatedAt;

  return (
    <div
      className={`group relative rounded-[1.75rem] transition-shadow duration-200 ${
        selected ? "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--canvas)]" : ""
      }`}
    >
      <Link
        href={`/notes/${note.id}`}
        onClick={(event) => {
          if (selecting) {
            event.preventDefault();
            onToggleSelect();
          }
        }}
        className="flex h-[14.5rem] flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6 transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-in-out)] hover:bg-[var(--surface-hover)] active:scale-[0.992] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <div className="flex items-center gap-2 pr-8 text-[0.9375rem]/5 text-[var(--ink-muted)]">
          <span className="truncate">{formatTime(timestamp)}</span>
          {note.durationSec ? <span className="text-xs text-[var(--ink-muted)]/80">· {formatDuration(note.durationSec)}</span> : null}
          {note.source === "meeting" && (
            <span title="Meeting recording" className="inline-flex items-center">
              <MonitorSpeaker className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
          {note.speakers && (
            <span title="Multi-speaker" className="inline-flex items-center">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
          {note.rewriteCount > 0 && (
            <span
              className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand)]"
              title="Rewrites and translations"
            >
              {note.rewritesProcessing > 0 ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {note.rewriteCount}
            </span>
          )}
        </div>

        <h3 className="mt-2 line-clamp-2 text-[1.25rem]/[1.25] font-semibold tracking-[-0.01em] text-[var(--ink)]">
          {note.title || (processing ? "New note" : "Untitled note")}
        </h3>

        {processing ? (
          <p className="mt-2 inline-flex items-center gap-2 text-[0.9375rem] text-[var(--ink-muted)]">
            <Spinner className="h-4 w-4 text-[var(--brand)]" />
            {note.status === "uploading" ? "Uploading audio…" : note.stage || "Transcribing…"}
          </p>
        ) : note.status === "failed" ? (
          <p className="mt-2 inline-flex items-start gap-1.5 text-[0.9375rem] text-[var(--danger)]">
            <AlertCircle className="mt-1 h-4 w-4 shrink-0" />
            <span className="line-clamp-3">{note.error || "Couldn't transcribe this recording. Open to try again."}</span>
          </p>
        ) : (
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[1.03125rem]/[1.5] text-[var(--ink-body)]">
            {note.preview || "Empty note"}
          </p>
        )}

        {note.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink-subtle)]"
              >
                <TagDot color={tag.color} />
                {tag.title}
              </span>
            ))}
          </div>
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
        className={`absolute right-5 top-5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-[opacity,background-color,border-color] duration-200 ${
          selected
            ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)] opacity-100"
            : `border-[var(--ink-muted)] bg-[var(--surface)] ${
                selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`
        }`}
      >
        <AnimatePresence initial={false}>
          {selected && (
            <motion.span
              key="check"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={SPRING_SNAPPY}
              className="inline-flex"
            >
              <Check className="h-3 w-3" strokeWidth={2.75} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {!selecting && (
        <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/92 p-0.5 opacity-0 shadow-xs backdrop-blur-sm transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onArchive}
            title={note.archived ? "Restore from archive" : "Archive"}
            aria-label={note.archived ? "Restore note" : "Archive note"}
            className="icon-btn h-8 w-8"
          >
            {note.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            aria-label="Delete note"
            className="icon-btn h-8 w-8 hover:!text-[var(--danger)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
