"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { DictionaryEntry, Replacement, Tag } from "@/lib/types";
import { TagManager } from "../TagManager";
import { useToast } from "../Toast";
import { Accordion, Switch } from "../ui";
import { SectionCard, SectionHeader } from "./SectionLayout";

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

export function DictionarySection() {
  const toast = useToast();
  const [entries, setEntries] = useState<DictionaryEntry[] | null>(null);
  const [word, setWord] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");

  const load = useCallback(async () => {
    try {
      setEntries((await api<{ entries: DictionaryEntry[] }>("/api/dictionary")).entries);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);
  const { busy, run } = useRunner(load);

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

      <SectionCard title={entries ? `${entries.length} word${entries.length === 1 ? "" : "s"}` : "Loading…"}>
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

export function ReplacementsSection() {
  const toast = useToast();
  const [rules, setRules] = useState<Replacement[] | null>(null);
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ find: "", replaceWith: "" });

  const load = useCallback(async () => {
    try {
      setRules((await api<{ replacements: Replacement[] }>("/api/replacements")).replacements);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);
  const { busy, run } = useRunner(load);

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

      <SectionCard title={rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "Loading…"}>
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
      <SectionCard>{tags ? <TagManager tags={tags} onChanged={() => void load()} /> : <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" />}</SectionCard>
    </div>
  );
}
