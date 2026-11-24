"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Trash2, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import type { Tag } from "@/lib/types";
import { useConfirm } from "./ConfirmDialog";
import { TagsIllustration } from "./icons";
import { useToast } from "./Toast";
import { Dialog, TagDot } from "./ui";

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
            value.toUpperCase() === color ? "scale-110 ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface-panel)]" : ""
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/** Create, rename, recolor, reorder and delete tags matching Letterly's 05-notes-edit-tags.png. */
export function TagManager({ tags, onChanged, compact = false }: { tags: Tag[]; onChanged: () => void; compact?: boolean }) {
  const toast = useToast();
  const askConfirm = useConfirm();
  const [creating, setCreating] = useState(false);
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
    const ok = await run(() => api("/api/tags", { json: { title: title.trim(), color } }), "Tag created");
    if (ok) {
      setTitle("");
      setColor(TAG_COLORS[(tags.length + 1) % TAG_COLORS.length]);
      setCreating(false);
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
    <div className="space-y-4">
      {!compact && (
        <div className="flex justify-center pb-1">
          <TagsIllustration className="h-14 w-14" />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-[var(--surface-panel-card)] px-4 py-1.5">
        <div className="py-2.5 text-[0.9375rem] font-medium text-[var(--ink)]">All</div>
        <div className="py-2.5 text-[0.9375rem] font-medium text-[var(--ink)]">Unsorted</div>

        {tags.map((tag, index) => (
          <div key={tag.id} className="py-2">
            {editingId === tag.id ? (
              <form
                className="space-y-2.5 py-1"
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
              <div className="flex items-center gap-2.5">
                <TagDot color={tag.color} className="h-2.5 w-2.5" />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-[var(--ink)]">{tag.title}</span>
                {typeof tag.noteCount === "number" && <span className="text-xs text-[var(--ink-muted)]">{tag.noteCount}</span>}
                <button type="button" className="icon-btn h-7 w-7" aria-label={`Move ${tag.title} up`} disabled={busy || index === 0} onClick={() => void move(index, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="icon-btn h-7 w-7"
                  aria-label={`Move ${tag.title} down`}
                  disabled={busy || index === tags.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="icon-btn h-7 w-7"
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
                  className="icon-btn h-7 w-7 hover:!text-[var(--danger)]"
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
          </div>
        ))}

        <div className="py-2.5 text-[0.9375rem] font-medium text-[var(--ink)]">Archive</div>
      </div>

      {creating ? (
        <form onSubmit={create} className="space-y-3 rounded-2xl bg-[var(--surface-panel-card)] p-4">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={40}
              placeholder="Tag name"
              aria-label="New tag name"
              autoFocus
              className="field rounded-full bg-[var(--surface-input)]"
            />
            <button type="submit" disabled={!title.trim() || busy} className="btn btn-purple shrink-0">
              Add
            </button>
            <button type="button" onClick={() => setCreating(false)} aria-label="Cancel" className="icon-btn h-10 w-10">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ColorPicker value={color} onChange={setColor} />
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="btn btn-purple h-12 w-full rounded-2xl text-[0.9375rem]">
          New tag
        </button>
      )}
    </div>
  );
}

export function TagModal({ open, tags, onClose, onChanged }: { open: boolean; tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Tags" centeredHeader size="md">
      <TagManager tags={tags} onChanged={onChanged} />
    </Dialog>
  );
}
