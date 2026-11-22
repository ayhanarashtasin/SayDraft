"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import type { Tag } from "@/lib/types";
import { Dialog, TagDot } from "./ui";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";

export const TAG_COLORS = ["#E11D48", "#EA580C", "#D97706", "#059669", "#0284C7", "#4F46E5", "#7C3AED", "#C026D3", "#0D9488", "#475569"];

function ColorPicker({ value, onChange, size = "h-6 w-6" }: { value: string; onChange: (color: string) => void; size?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tag color">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value.toUpperCase() === color}
          aria-label={`Color ${color}`}
          onClick={() => onChange(color)}
          className={`${size} cursor-pointer rounded-full transition-transform ${
            value.toUpperCase() === color ? "scale-110 ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface)]" : ""
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/** Create, rename, recolor, reorder and delete tags. */
export function TagManager({ tags, onChanged }: { tags: Tag[]; onChanged: () => void }) {
  const toast = useToast();
  const askConfirm = useConfirm();
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(TAG_COLORS[tags.length % TAG_COLORS.length]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editColor, setEditColor] = useState(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast(success);
      onChanged();
      return true;
    } catch (error) {
      toast(errorMessage(error), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const ok = await run(() => api("/api/tags", { json: { title: title.trim(), color } }));
    if (ok) {
      setTitle("");
      setColor(TAG_COLORS[(tags.length + 1) % TAG_COLORS.length]);
    }
  }

  async function move(index: number, delta: number) {
    const ids = tags.map((tag) => tag.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run(() => api("/api/tags/reorder", { json: { ids } }));
  }

  return (
    <div>
      <form onSubmit={create} className="space-y-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={40}
            placeholder="New tag name"
            aria-label="New tag name"
            className="field"
          />
          <button type="submit" disabled={!title.trim() || busy} className="btn btn-primary shrink-0">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
      </form>

      <ul className="mt-5 space-y-2">
        {tags.length === 0 && <li className="py-6 text-center text-sm text-[var(--ink-muted)]">No tags yet. Tags help you filter and organize notes.</li>}
        {tags.map((tag, index) => (
          <li key={tag.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5">
            {editingId === tag.id ? (
              <form
                className="space-y-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await run(() => api(`/api/tags/${tag.id}`, { method: "PATCH", json: { title: editTitle, color: editColor } }));
                  if (ok) setEditingId(null);
                }}
              >
                <div className="flex items-center gap-2">
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={40} aria-label="Tag name" className="field py-1.5" autoFocus />
                  <button type="submit" className="icon-btn" aria-label="Save tag" disabled={busy || !editTitle.trim()}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <ColorPicker value={editColor} onChange={setEditColor} size="h-5 w-5" />
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <TagDot color={tag.color} className="h-3 w-3" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{tag.title}</span>
                {typeof tag.noteCount === "number" && <span className="text-xs text-[var(--ink-muted)]">{tag.noteCount}</span>}
                <button type="button" className="icon-btn h-8 w-8" aria-label={`Move ${tag.title} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="icon-btn h-8 w-8"
                  aria-label={`Move ${tag.title} down`}
                  disabled={busy || index === tags.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="icon-btn h-8 w-8"
                  aria-label={`Edit ${tag.title}`}
                  onClick={() => {
                    setEditingId(tag.id);
                    setEditTitle(tag.title);
                    setEditColor(tag.color);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="icon-btn h-8 w-8 hover:!text-[var(--danger)]"
                  aria-label={`Delete ${tag.title}`}
                  disabled={busy}
                  onClick={async () => {
                    const confirmed = await askConfirm({
                      title: "Delete this tag?",
                      subject: tag.title,
                      message: "Notes keep their content. Only the tag is removed.",
                      confirmLabel: "Delete",
                      tone: "danger",
                      icon: Trash2,
                    });
                    if (confirmed) void run(() => api(`/api/tags/${tag.id}`, { method: "DELETE" }), "Tag deleted");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TagModal({ open, tags, onClose, onChanged }: { open: boolean; tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit tags" description="Tags appear as filters on your notes list.">
      <TagManager tags={tags} onChanged={onChanged} />
    </Dialog>
  );
}
