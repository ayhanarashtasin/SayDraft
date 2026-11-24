"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { DictionaryEntry, Replacement, Tag } from "@/lib/types";
import { DictionaryIllustration, PlusThinIcon, ScissorsIllustration } from "../icons";
import { TagManager } from "../TagManager";
import { useToast } from "../Toast";
import { Accordion, Switch } from "../ui";
import { SectionCard, SectionHeader } from "./SectionLayout";

function useVocabularyList<T>(path: string, key: string) {
  const toast = useToast();
  const [items, setItems] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      const data = await api<Record<string, T[]>>(path, { signal });
      setItems(data[key]);
    } catch (error) {
      if (signal?.aborted) return;
      setFailed(true);
      toast(errorMessage(error), "error");
    }
  }, [key, path, toast]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  return { items, failed, load };
}

function VocabularyPlaceholder({
  failed,
  label,
  onRetry,
  children,
}: {
  failed: boolean;
  label: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (failed) {
    return <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Retry loading {label}</button>;
  }
  return (
    <>
      <p role="status" className="sr-only">Loading {label}…</p>
      <div aria-hidden="true" className="flex gap-2 motion-safe:animate-pulse">{children}</div>
    </>
  );
}

function useRunner(reload: () => Promise<void>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      try {
        await action();
        if (success) toast(success);
        await reload();
        return true;
      } catch (error) {
        toast(errorMessage(error), "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, toast],
  );
  return { busy, run };
}

export function DictionarySection({ embedded = false }: { embedded?: boolean }) {
  const toast = useToast();
  const { items: entries, failed, load } = useVocabularyList<DictionaryEntry>("/api/dictionary", "entries");
  const [word, setWord] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");

  const { busy, run } = useRunner(load);

  if (embedded) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center">
          <DictionaryIllustration className="h-14 w-14" />
          <h3 className="mt-2.5 text-lg font-bold text-[var(--ink)]">Dictionary</h3>
          <p className="mt-1 max-w-xs text-xs text-[var(--ink-subtle)]">
            Add specific words or names to ensure accuracy.
          </p>
        </div>

        <form
          className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-1.5 shadow-xs"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => api("/api/dictionary", { json: { word } }))) setWord("");
          }}
        >
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            maxLength={60}
            placeholder="e.g. Saydraft, Dr. Rahman"
            aria-label="New word"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
          />
          <button
            type="submit"
            disabled={busy || !word.trim()}
            aria-label="Add word"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--brand)] text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusThinIcon className="h-4 w-4" />
          </button>
        </form>

        <div className="min-h-[3.5rem]">
          {entries && entries.length === 0 ? (
            <div className="flex flex-wrap justify-center gap-2 opacity-60">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-sm text-[var(--ink-muted)]">
                Saydraft <span className="text-xs">+</span>
              </span>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {entries?.map((entry) => (
                <li
                  key={entry.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] py-1.5 pl-3.5 pr-2 text-sm font-medium text-[var(--ink)]"
                >
                  <span>{entry.word}</span>
                  <button
                    type="button"
                    className="cursor-pointer rounded-full p-0.5 text-[var(--ink-muted)] hover:text-[var(--danger)]"
                    aria-label={`Remove ${entry.word}`}
                    disabled={busy}
                    onClick={() => void run(() => api(`/api/dictionary/${entry.id}`, { method: "DELETE" }))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Dictionary"
        description="Save names, brands, and specialty words you say often so transcripts always spell them correctly."
      />
      <SectionCard>
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => api("/api/dictionary", { json: { word } }))) setWord("");
          }}
        >
          <input value={word} onChange={(event) => setWord(event.target.value)} maxLength={60} placeholder="e.g. Saydraft, Dr. Rahman, latte" aria-label="New word" className="field" />
          <button type="submit" disabled={busy || !word.trim()} className="btn btn-primary shrink-0">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={bulkOpen}
            onClick={() => setBulkOpen((open) => !open)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <motion.span animate={{ rotate: bulkOpen ? 180 : 0 }} transition={SPRING_SNAPPY} className="inline-flex">
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
            Add many words at once
          </button>
          <Accordion open={bulkOpen}>
            <form
              className="space-y-2 pt-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const words = bulk.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
                if (words.length === 0) return;
                const ok = await run(async () => {
                  const data = await api<{ added: number }>("/api/dictionary", { json: { words } });
                  toast(`Added ${data.added} new word${data.added === 1 ? "" : "s"}.`);
                });
                if (ok) setBulk("");
              }}
            >
              <textarea value={bulk} onChange={(event) => setBulk(event.target.value)} rows={3} placeholder="One per line, or separated by commas (up to 100)" className="field resize-y" />
              <button type="submit" disabled={busy || !bulk.trim()} className="btn btn-secondary btn-sm">
                Add all
              </button>
            </form>
          </Accordion>
        </div>
      </SectionCard>

      <SectionCard title={entries ? `${entries.length} word${entries.length === 1 ? "" : "s"}` : "Saved words"}>
        {!entries && (
          <VocabularyPlaceholder failed={failed} label="dictionary" onRetry={() => void load()}>
            <div className="h-7 w-16 rounded-full bg-[var(--surface-subtle)]" />
            <div className="h-7 w-24 rounded-full bg-[var(--surface-subtle)]" />
            <div className="h-7 w-20 rounded-full bg-[var(--surface-subtle)]" />
          </VocabularyPlaceholder>
        )}
        {entries && entries.length === 0 && <p className="text-sm text-[var(--ink-muted)]">Your dictionary is empty.</p>}
        <ul className="flex flex-wrap gap-2">
          {entries?.map((entry) =>
            editing === entry.id ? (
              <li key={entry.id} className="flex items-center gap-1">
                <input value={editWord} onChange={(event) => setEditWord(event.target.value)} maxLength={60} aria-label="Edit word" className="field w-44 py-1" autoFocus />
                <button
                  type="button"
                  className="icon-btn h-8 w-8"
                  aria-label="Save"
                  onClick={async () => {
                    if (await run(() => api(`/api/dictionary/${entry.id}`, { method: "PATCH", json: { word: editWord } }))) setEditing(null);
                  }}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" className="icon-btn h-8 w-8" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ) : (
              <li key={entry.id} className="group inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] py-1 pl-3 pr-1 text-sm">
                {entry.word}
                <button
                  type="button"
                  className="cursor-pointer rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  aria-label={`Edit ${entry.word}`}
                  onClick={() => {
                    setEditing(entry.id);
                    setEditWord(entry.word);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="cursor-pointer rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--danger)]"
                  aria-label={`Remove ${entry.word}`}
                  disabled={busy}
                  onClick={() => void run(() => api(`/api/dictionary/${entry.id}`, { method: "DELETE" }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ),
          )}
        </ul>
      </SectionCard>
    </div>
  );
}

export function ReplacementsSection({ embedded = false }: { embedded?: boolean }) {
  const { items: rules, failed, load } = useVocabularyList<Replacement>("/api/replacements", "replacements");
  const [creating, setCreating] = useState(false);
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ find: "", replaceWith: "" });

  const { busy, run } = useRunner(load);

  if (embedded) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center">
          <ScissorsIllustration className="h-11 w-11 text-[var(--ink)]" />
          <h3 className="mt-2.5 text-lg font-bold text-[var(--ink)]">Text replacements</h3>
          <p className="mt-1 max-w-xs text-xs text-[var(--ink-subtle)]">
            Save replacement to speak the things you type all the time.
          </p>
        </div>

        {rules && rules.length === 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {[
              ["John", "Joan"],
              ["Saydrft", "Saydraft"],
              ["My email", "joan@saydraft.app"],
            ].map(([from, to]) => (
              <span
                key={from}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-xs text-[var(--ink-muted)]"
              >
                <span className="line-through">{from}</span>
                <span aria-hidden="true" className="text-[var(--sky)]">→</span>
                <span className="font-medium text-[var(--ink)]">{to}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-2xl bg-[var(--surface-panel-card)] divide-y divide-[var(--border)]/70">
            {rules?.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <div className={`min-w-0 flex-1 text-sm ${rule.isActive ? "" : "opacity-50"}`}>
                  <span className="text-[var(--ink-muted)] line-through">{rule.find}</span>
                  <span className="mx-1.5 text-[var(--brand)]">→</span>
                  <span className="font-medium text-[var(--ink)]">{rule.replaceWith || "(remove)"}</span>
                </div>
                <Switch
                  checked={rule.isActive}
                  onChange={(value) => void run(() => api(`/api/replacements/${rule.id}`, { method: "PATCH", json: { isActive: value } }))}
                  label={`Toggle rule ${rule.find}`}
                  hideLabel
                />
                <button
                  type="button"
                  className="icon-btn h-7 w-7 hover:!text-[var(--danger)]"
                  aria-label={`Delete rule for ${rule.find}`}
                  disabled={busy}
                  onClick={() => void run(() => api(`/api/replacements/${rule.id}`, { method: "DELETE" }))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {creating ? (
          <form
            className="space-y-2.5 rounded-2xl bg-[var(--surface-panel-card)] p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run(() => api("/api/replacements", { json: { find, replaceWith } }))) {
                setFind("");
                setReplaceWith("");
                setCreating(false);
              }
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={find} onChange={(event) => setFind(event.target.value)} maxLength={100} placeholder="When I say…" aria-label="Text to replace" autoFocus className="field rounded-full bg-[var(--surface-input)]" />
              <input value={replaceWith} onChange={(event) => setReplaceWith(event.target.value)} maxLength={500} placeholder="Replace with…" aria-label="Replacement" className="field rounded-full bg-[var(--surface-input)]" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !find.trim()} className="btn btn-purple btn-sm">
                Save rule
              </button>
            </div>
          </form>
        ) : (
          <div className="flex justify-center">
            <button type="button" onClick={() => setCreating(true)} className="btn btn-purple h-11 rounded-full px-6 text-sm">
              <Plus className="h-4 w-4" /> Add new
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Text replacements"
        description="Turn spoken phrases into custom text or automatically fix recurring wording. Runs on new transcripts or anytime from a note's menu."
      />
      <SectionCard>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => api("/api/replacements", { json: { find, replaceWith } }))) {
              setFind("");
              setReplaceWith("");
            }
          }}
        >
          <input value={find} onChange={(event) => setFind(event.target.value)} maxLength={100} placeholder="When I say…" aria-label="Text to replace" className="field" />
          <ArrowRight className="hidden h-4 w-4 text-[var(--ink-muted)] sm:block" />
          <input value={replaceWith} onChange={(event) => setReplaceWith(event.target.value)} maxLength={500} placeholder="…write this" aria-label="Replacement" className="field" />
          <button type="submit" disabled={busy || !find.trim()} className="btn btn-primary">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </SectionCard>

      <SectionCard title={rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "Saved rules"}>
        {!rules && (
          <VocabularyPlaceholder failed={failed} label="text replacements" onRetry={() => void load()}>
            <div className="h-10 w-full rounded-xl bg-[var(--surface-subtle)]" />
          </VocabularyPlaceholder>
        )}
        {rules && rules.length === 0 && <p className="text-sm text-[var(--ink-muted)]">No shortcuts yet. Example: “gonna” → “going to”.</p>}
        <ul className="divide-y divide-[var(--border)]">
          {rules?.map((rule) => (
            <li key={rule.id} className="py-2.5">
              {editing === rule.id ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input value={draft.find} onChange={(event) => setDraft({ ...draft, find: event.target.value })} aria-label="Text to replace" className="field py-1.5" />
                  <input value={draft.replaceWith} onChange={(event) => setDraft({ ...draft, replaceWith: event.target.value })} aria-label="Replacement" className="field py-1.5" />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        if (await run(() => api(`/api/replacements/${rule.id}`, { method: "PATCH", json: draft }))) setEditing(null);
                      }}
                    >
                      Save
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`min-w-0 flex-1 text-sm ${rule.isActive ? "" : "opacity-50"}`}>
                    <span className="font-medium">{rule.find}</span>
                    <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-[var(--ink-muted)]" />
                    <span>{rule.replaceWith || <em className="text-[var(--ink-muted)]">(remove)</em>}</span>
                  </div>
                  <div className="w-11">
                    <Switch
                      checked={rule.isActive}
                      onChange={(value) => void run(() => api(`/api/replacements/${rule.id}`, { method: "PATCH", json: { isActive: value } }))}
                      label={`Use rule for "${rule.find}"`}
                      hideLabel
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8"
                    aria-label={`Edit rule for ${rule.find}`}
                    onClick={() => {
                      setEditing(rule.id);
                      setDraft({ find: rule.find, replaceWith: rule.replaceWith });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 hover:!text-[var(--danger)]"
                    aria-label={`Delete rule for ${rule.find}`}
                    disabled={busy}
                    onClick={() => void run(() => api(`/api/replacements/${rule.id}`, { method: "DELETE" }))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

export function TagsSection() {
  const toast = useToast();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const load = useCallback(async () => {
    try {
      setTags((await api<{ tags: Tag[] }>("/api/tags")).tags);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-5">
      <SectionHeader title="Tags" description="Tags appear right above your notes list for quick filtering." />
      <SectionCard>{tags ? <TagManager compact tags={tags} onChanged={() => void load()} /> : <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" />}</SectionCard>
    </div>
  );
}
