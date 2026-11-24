"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackArrowIcon } from "@/components/icons";
import { useAppStatus } from "@/components/StatusProvider";
import { Spinner, TagDot } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import type { Note, Tag } from "@/lib/types";

const DRAFT_KEY = "saydraft-new-note-draft";

export default function NewNotePage() {
  const router = useRouter();
  const { status } = useAppStatus();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ tags: Tag[] }>("/api/tags").then((data) => setTags(data.tags)).catch(() => undefined);
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") as { title?: string; body?: string } | null;
      if (draft?.title) setTitle(draft.title);
      if (draft?.body) setBody(draft.body);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body }));
    } catch {
      // ignore
    }
  }, [title, body]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { note } = await api<{ note: Note }>("/api/notes", {
        json: { kind: "text", title: title.trim() || undefined, transcript: body, tagIds },
      });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      router.push(`/notes/${note.id}`);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex min-h-screen w-full flex-col items-center bg-[var(--canvas)]">
      <div className="sticky top-0 z-20 flex min-h-[3.875rem] w-full items-center justify-between border-b border-[var(--border)]/70 bg-[var(--canvas)]/88 px-5 backdrop-blur-md">
        <Link href="/" aria-label="Back to notes" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65">
          <BackArrowIcon className="h-5 w-5" />
        </Link>
        <button type="submit" disabled={!body.trim() || saving} className="btn btn-primary btn-sm">
          {saving && <Spinner className="h-3.5 w-3.5" />} {saving ? "Saving…" : "Save note"}
        </button>
      </div>

      <main className="flex w-full max-w-[40.75rem] flex-1 flex-col px-5 pb-12 pt-8 sm:px-6 sm:pt-10">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          placeholder={status?.configured && status.settings.autoTitle ? "Title (or leave blank to generate one)" : "Title"}
          aria-label="Title"
          className="w-full bg-transparent text-[1.75rem]/[2.125rem] font-bold tracking-[-0.02em] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]/50"
        />

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
            {tags.map((tag) => {
              const on = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  data-active={on}
                  aria-pressed={on}
                  onClick={() => setTagIds((current) => (on ? current.filter((id) => id !== tag.id) : [...current, tag.id]))}
                  className="chip py-1 text-xs"
                >
                  <TagDot color={tag.color} /> {tag.title}
                </button>
              );
            })}
          </div>
        )}

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Start writing or paste your text…"
          aria-label="Note text"
          autoFocus
          className="prose-note mt-6 min-h-[55vh] w-full flex-1 resize-none bg-transparent text-[1.0625rem]/[1.65] text-[var(--ink-body)] outline-none [field-sizing:content] placeholder:text-[var(--ink-muted)]/55"
        />

        {error && (
          <p role="alert" className="alert alert-error mt-4">
            {error}
          </p>
        )}
      </main>
    </form>
  );
}
