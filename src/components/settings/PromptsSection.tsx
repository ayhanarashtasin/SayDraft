"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, Pencil, Plus, RotateCcw, Star, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { PROMPT_CATEGORIES } from "@/lib/templates";
import type { Prompt } from "@/lib/types";
import { useConfirm } from "../ConfirmDialog";
import { PromptIcon } from "../icons";
import { useToast } from "../Toast";
import { SectionHeader } from "./SectionLayout";

export function PromptsSection() {
  const toast = useToast();
  const askConfirm = useConfirm();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPrompts((await api<{ prompts: Prompt[] }>("/api/prompts")).prompts);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    if (!prompts) return [];
    const names = [...new Set([...PROMPT_CATEGORIES, ...prompts.map((prompt) => prompt.category)])];
    return names.map((name) => ({ name, items: prompts.filter((prompt) => prompt.category === name) })).filter((group) => group.items.length);
  }, [prompts]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast(success);
      await load();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Rewrite styles"
        description="Styles shown inside every note's Rewrite sidebar. Customize built-in ones, create your own, or browse the gallery."
        actions={
          <>
            <Link href="/settings/edit-prompt/new" className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> New style
            </Link>
            <Link href="/settings/gallery" className="btn btn-secondary btn-sm">
              <LayoutGrid className="h-3.5 w-3.5" /> Gallery
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const data = await api<{ added: number }>("/api/prompts/restore", { json: {} });
                  toast(data.added ? `Restored ${data.added} built-in style${data.added === 1 ? "" : "s"}.` : "All built-in styles are already here.");
                })
              }
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore defaults
            </button>
          </>
        }
      />

      {!prompts ? (
        <div className="surface-card h-40 animate-pulse rounded-3xl" />
      ) : prompts.length === 0 ? (
        <p className="surface-card rounded-3xl p-8 text-center text-sm text-[var(--ink-muted)]">
          No rewrite styles yet. Restore the defaults or browse the gallery.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.name} className="surface-card rounded-3xl p-2.5">
            <h2 className="px-3 pb-1.5 pt-2 text-xs font-semibold text-[var(--ink-muted)]">{group.name}</h2>
            <ul className="divide-y divide-[var(--border)]/50">
              {group.items.map((prompt, index) => (
                <li key={prompt.id} className="flex items-center gap-1 rounded-2xl px-2 py-2 transition-colors hover:bg-[var(--surface-subtle)]">
                  <button
                    type="button"
                    aria-label={prompt.isFavorite ? `Unfavorite ${prompt.title}` : `Favorite ${prompt.title}`}
                    aria-pressed={prompt.isFavorite}
                    className={`icon-btn h-8 w-8 ${prompt.isFavorite ? "!text-amber-500" : ""}`}
                    onClick={() => void run(() => api(`/api/prompts/${prompt.id}`, { method: "PATCH", json: { isFavorite: !prompt.isFavorite } }))}
                  >
                    <Star className={`h-4 w-4 ${prompt.isFavorite ? "fill-current" : ""}`} />
                  </button>
                  <PromptIcon builtinKey={prompt.builtinKey} templateId={prompt.templateId} category={prompt.category} className="h-5 w-5 shrink-0" />
                  <Link href={`/settings/edit-prompt/${prompt.id}`} className="min-w-0 flex-1 px-1">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">{prompt.title}</span>
                    <span className="block truncate text-xs text-[var(--ink-muted)]">{prompt.description || prompt.body}</span>
                  </Link>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8"
                    aria-label={`Move ${prompt.title} up`}
                    disabled={busy || index === 0}
                    onClick={() => void run(() => api(`/api/prompts/${prompt.id}`, { method: "PATCH", json: { move: "up" } }))}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8"
                    aria-label={`Move ${prompt.title} down`}
                    disabled={busy || index === group.items.length - 1}
                    onClick={() => void run(() => api(`/api/prompts/${prompt.id}`, { method: "PATCH", json: { move: "down" } }))}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <Link href={`/settings/edit-prompt/${prompt.id}`} className="icon-btn h-8 w-8" aria-label={`Edit ${prompt.title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 hover:!text-[var(--danger)]"
                    aria-label={`Delete ${prompt.title}`}
                    disabled={busy}
                    onClick={async () => {
                      const confirmed = await askConfirm({
                        title: "Delete this style?",
                        subject: prompt.title,
                        message: "Notes you already rewrote with it won't be affected.",
                        confirmLabel: "Delete",
                        tone: "danger",
                        icon: Trash2,
                      });
                      if (confirmed) void run(() => api(`/api/prompts/${prompt.id}`, { method: "DELETE" }), "Style deleted");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
