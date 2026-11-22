"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { Note, NoteListItem } from "@/lib/types";
import { useToast } from "../Toast";
import { Dialog, Spinner } from "../ui";

export function MergeDialog({ open, notes, onClose }: { open: boolean; notes: NoteListItem[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const ordered = [...notes].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const [title, setTitle] = useState("");
  const [archiveOriginals, setArchiveOriginals] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && ordered.length > 0) setTitle(`${ordered[0].title || "Untitled note"} + ${ordered.length - 1} more`);
  }, [open]);

  async function merge() {
    setBusy(true);
    try {
      const { note } = await api<{ note: Note }>("/api/notes/merge", {
        json: { ids: ordered.map((item) => item.id), title, archiveOriginals },
      });
      toast(`Merged ${ordered.length} notes`);
      onClose();
      router.push(`/notes/${note.id}`);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Merge ${ordered.length} notes`}
      description="Creates one new note with their text and audio, oldest first."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || ordered.length < 2} onClick={() => void merge()}>
            {busy && <Spinner className="h-3.5 w-3.5" />} Merge notes
          </button>
        </>
      }
    >
      <label className="block text-sm font-medium">
        Title of the merged note
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="field mt-1.5" />
      </label>
      <ol className="mt-4 space-y-1.5 text-sm">
        {ordered.map((note, index) => (
          <li key={note.id} className="flex gap-2 rounded-xl bg-[var(--surface-subtle)] px-3 py-2">
            <span className="text-[var(--ink-muted)]">{index + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{note.title || "Untitled note"}</span>
            <span className="shrink-0 text-xs text-[var(--ink-muted)]">{formatDateTime(note.createdAt)}</span>
          </li>
        ))}
      </ol>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={archiveOriginals} onChange={(event) => setArchiveOriginals(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
        Move the original notes to the archive
      </label>
    </Dialog>
  );
}
