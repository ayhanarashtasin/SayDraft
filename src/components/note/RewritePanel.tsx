"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Feather,
  FileText,
  LayoutGrid,
  ListChecks,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import { PROMPT_CATEGORIES } from "@/lib/templates";
import type { Prompt } from "@/lib/types";
import { Accordion, Spinner } from "../ui";

export type RewriteSource = "original" | "current";

interface RewritePanelProps {
  prompts: Prompt[];
  busyKey: string | null;
  disabled: boolean;
  disabledReason?: string;
  source: RewriteSource;
  canUseCurrent: boolean;
  currentLabel: string;
  onSourceChange: (source: RewriteSource) => void;
  onRun: (request: { promptId: number } | { instruction: string }) => void;
  onToggleFavorite: (prompt: Prompt) => void;
  onClose: () => void;
}

function promptVisual(prompt: Prompt) {
  const title = prompt.title.toLowerCase();
  const category = prompt.category.toLowerCase();
  if (title.includes("list") || title.includes("bullet") || title.includes("structured")) {
    return { Icon: ListChecks, bg: "bg-sky-500/15 text-sky-600 dark:text-sky-300" };
  }
  if (title.includes("magic")) {
    return { Icon: Sparkles, bg: "bg-amber-500/15 text-amber-600 dark:text-amber-300" };
  }
  if (category.includes("email")) {
    return { Icon: Mail, bg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" };
  }
  if (category.includes("summary")) {
    return { Icon: FileText, bg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" };
  }
  if (category.includes("work")) {
    return { Icon: Briefcase, bg: "bg-blue-500/15 text-blue-600 dark:text-blue-300" };
  }
  if (category.includes("journal")) {
    return { Icon: BookOpen, bg: "bg-amber-500/15 text-amber-600 dark:text-amber-300" };
  }
  if (category.includes("content")) {
    return { Icon: Share2, bg: "bg-pink-500/15 text-pink-600 dark:text-pink-300" };
  }
  if (category.includes("writing")) {
    return { Icon: Feather, bg: "bg-purple-500/15 text-purple-600 dark:text-purple-300" };
  }
  if (category.includes("personal")) {
    return { Icon: MessageSquare, bg: "bg-rose-500/15 text-rose-600 dark:text-rose-300" };
  }
  if (category.includes("editing")) {
    return { Icon: AlignLeft, bg: "bg-violet-500/15 text-violet-600 dark:text-violet-300" };
  }
  return { Icon: Wand2, bg: "bg-[var(--brand-soft)] text-[var(--brand)]" };
}

export function RewritePanel(props: RewritePanelProps) {
  const { prompts, busyKey, disabled, disabledReason, source, canUseCurrent, currentLabel } = props;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLTextAreaElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? prompts.filter((prompt) => prompt.title.toLowerCase().includes(q) || prompt.description.toLowerCase().includes(q))
      : prompts;
    const result: Array<{ name: string; items: Prompt[] }> = [];
    const favorites = visible.filter((prompt) => prompt.isFavorite);
    if (favorites.length) result.push({ name: "Favorites", items: favorites });
    const categories = [...PROMPT_CATEGORIES, ...new Set(visible.map((prompt) => prompt.category))];
    for (const category of new Set(categories)) {
      const items = visible.filter((prompt) => prompt.category === category && !prompt.isFavorite);
      if (items.length) result.push({ name: category, items });
    }
    return result;
  }, [prompts, query]);

  function submitInstruction(event: React.FormEvent) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || disabled) return;
    props.onRun({ instruction: text });
    setInstruction("");
  }

  function cycleSource() {
    if (!canUseCurrent && source === "original") return;
    props.onSourceChange(source === "original" ? "current" : "original");
  }

  return (
    <aside aria-label="Rewrite options" className="flex h-full w-full flex-col bg-[var(--surface-panel)]">
      <div className="flex min-h-[3.875rem] items-center justify-between gap-2 border-b border-[var(--border)] px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[1.0625rem] font-semibold text-[var(--ink)]">Rewrite</h2>
          <motion.button
            type="button"
            whileTap={TAP_PRESS}
            onClick={cycleSource}
            title={
              source === "original"
                ? canUseCurrent
                  ? `Rewriting original text — click to switch to "${currentLabel}"`
                  : "Rewriting original text (open a rewritten version to chain from it)"
                : `Rewriting "${currentLabel}" — click to switch to original text`
            }
            aria-label={`Rewrite mode: ${source === "original" ? "original text" : "current version"}`}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--surface-panel-card)] px-2.5 py-1 text-[0.875rem]/5 font-medium text-[var(--ink-subtle)] transition-opacity hover:opacity-75"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="relative inline-flex overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={source}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.14, ease: EASE_OUT }}
                  className="truncate"
                >
                  {source === "original" ? "original text" : "current version"}
                </motion.span>
              </AnimatePresence>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </motion.button>
        </div>

        <motion.button
          type="button"
          whileTap={TAP_ICON}
          onClick={props.onClose}
          aria-label="Close rewrite panel"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--surface-panel-card)] text-[var(--ink-subtle)] transition-opacity hover:opacity-70"
        >
          <X className="h-4 w-4" />
        </motion.button>
      </div>

      {disabled && disabledReason && (
        <p className="border-b border-[var(--border)]/70 bg-[var(--surface-panel-card)]/45 px-5 py-2.5 text-xs text-[var(--ink-subtle)]">
          {disabledReason}
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No rewrite styles match “{query}”.</p>
        )}
        {groups.map((group) => (
          <section key={group.name}>
            <h3 className="mb-1 text-[0.875rem] font-medium text-[var(--ink-muted)]">{group.name}</h3>
            <ul className="divide-y divide-[var(--border)]">
              {group.items.map((prompt) => {
                const running = busyKey === `prompt:${prompt.id}`;
                const { Icon, bg } = promptVisual(prompt);
                return (
                  <li key={prompt.id} className="group/prompt flex min-h-[3.75rem] items-center gap-2 py-1.5">
                    <motion.button
                      type="button"
                      disabled={disabled}
                      whileTap={disabled ? undefined : TAP_PRESS}
                      transition={SPRING_SNAPPY}
                      onClick={() => props.onRun({ promptId: prompt.id })}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-2xl py-1.5 text-left transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                        {running ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[1.03125rem]/6 font-semibold text-[var(--ink)]">{prompt.title}</span>
                        {prompt.description && (
                          <span className="block truncate text-xs text-[var(--ink-muted)]">{prompt.description}</span>
                        )}
                      </span>
                    </motion.button>

                    <Link
                      href={`/settings/edit-prompt/${prompt.id}`}
                      aria-label={`Edit ${prompt.title}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] opacity-0 transition-opacity hover:text-[var(--ink)] focus-visible:opacity-100 group-hover/prompt:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>

                    <motion.button
                      type="button"
                      whileTap={TAP_ICON}
                      onClick={() => props.onToggleFavorite(prompt)}
                      aria-label={prompt.isFavorite ? `Remove ${prompt.title} from favorites` : `Add ${prompt.title} to favorites`}
                      aria-pressed={prompt.isFavorite}
                      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[color,opacity] duration-150 ${
                        prompt.isFavorite
                          ? "text-amber-500 opacity-100"
                          : "text-[var(--ink-subtle)] opacity-55 hover:opacity-100"
                      }`}
                    >
                      <motion.span
                        animate={{ scale: prompt.isFavorite ? [1, 1.25, 1] : 1 }}
                        transition={{ duration: 0.26, ease: EASE_OUT }}
                        className="inline-flex"
                      >
                        <Star className={`h-4 w-4 ${prompt.isFavorite ? "fill-current" : ""}`} />
                      </motion.span>
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface-panel)]/95 px-5 py-3 backdrop-blur-md">
        <Accordion open={customOpen}>
          <form onSubmit={submitInstruction} className="flex items-end gap-2 pb-3">
            <textarea
              ref={customRef}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitInstruction(event);
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Ask AI in your own words…"
              aria-label="Custom rewrite instruction"
              className="field min-h-[2.75rem] resize-none bg-[var(--surface)] py-2"
            />
            <button
              type="submit"
              disabled={disabled || !instruction.trim()}
              aria-label="Run custom instruction"
              className="btn btn-primary h-10 w-10 shrink-0 p-0"
            >
              {busyKey === "instruction" ? <Spinner /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </Accordion>

        <Accordion open={searchOpen || Boolean(query)}>
          <div className="relative pb-3">
            <Search className="pointer-events-none absolute left-3 top-[1.25rem] h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a rewrite style…"
              aria-label="Find a rewrite style"
              className="field rounded-full bg-[var(--surface)] pl-9 pr-8 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="absolute right-2.5 top-[1.25rem] -translate-y-1/2 cursor-pointer text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </Accordion>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Link
              href="/settings/edit-prompt/new"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 text-sm font-semibold text-[var(--ink)] shadow-xs transition-[opacity,transform] duration-150 hover:opacity-75 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" /> New
            </Link>
            <motion.button
              type="button"
              whileTap={TAP_PRESS}
              onClick={() => {
                setCustomOpen((open) => !open);
                setTimeout(() => customRef.current?.focus(), 20);
              }}
              aria-pressed={customOpen}
              className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 ${
                customOpen
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] hover:opacity-80"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" /> Ask AI
            </motion.button>
            <Link
              href="/settings/gallery"
              title="Browse Rewrite Options Gallery"
              aria-label="Browse Rewrite Options Gallery"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink-subtle)] transition-[opacity,transform] duration-150 hover:opacity-75 active:scale-95"
            >
              <LayoutGrid className="h-4 w-4" />
            </Link>
          </div>

          <motion.button
            type="button"
            whileTap={TAP_ICON}
            onClick={() => {
              setSearchOpen((open) => !open || Boolean(query));
              setTimeout(() => searchRef.current?.focus(), 20);
            }}
            aria-label="Search rewrite styles"
            aria-pressed={searchOpen}
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 ${
              searchOpen || query
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] hover:opacity-75"
            }`}
          >
            <Search className="h-4 w-4" />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
