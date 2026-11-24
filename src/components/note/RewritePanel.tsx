"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Send, Star, Wand2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import { PROMPT_CATEGORIES } from "@/lib/templates";
import type { Prompt } from "@/lib/types";
import { CurvedArrowDownIcon, PromptIcon, SearchLoopIcon } from "../icons";
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
  onOpenGallery?: () => void;
  onClose: () => void;
}

export function RewritePanel(props: RewritePanelProps) {
  const { prompts, busyKey, disabled, disabledReason, source, canUseCurrent, currentLabel } = props;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
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
          <h2 className="text-[1rem] font-semibold text-[var(--ink)]">Rewrite</h2>
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
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--surface-panel-card)] px-2.5 py-1 text-xs font-medium text-[var(--ink-subtle)] transition-opacity hover:opacity-75"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-65" />
            <span className="relative inline-flex overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={source}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14, ease: EASE_OUT }}
                  className="truncate"
                >
                  {source === "original" ? "original text" : "current version"}
                </motion.span>
              </AnimatePresence>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-65" />
          </motion.button>
        </div>

        <motion.button
          type="button"
          whileTap={TAP_ICON}
          onClick={props.onClose}
          aria-label="Close rewrite panel"
          className="circle-close"
        >
          <X className="h-4 w-4" />
        </motion.button>
      </div>

      {disabled && disabledReason && (
        <p className="border-b border-[var(--border)]/70 bg-[var(--surface-panel-card)]/45 px-5 py-2.5 text-xs text-[var(--ink-subtle)]">
          {disabledReason}
        </p>
      )}

      <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No rewrite styles match “{query}”.</p>
        )}
        {groups.map((group) => (
          <section key={group.name}>
            <h3 className="mb-1 text-[0.875rem] font-medium text-[var(--ink-muted)]">{group.name}</h3>
            <ul className="divide-y divide-[var(--border)]">
              {group.items.map((prompt) => {
                const running = busyKey === `prompt:${prompt.id}`;
                return (
                  <li key={prompt.id} className="group/prompt flex min-h-16 items-center gap-2 py-1">
                    <motion.button
                      type="button"
                      disabled={disabled}
                      title={prompt.description || prompt.title}
                      whileTap={disabled ? undefined : TAP_PRESS}
                      transition={SPRING_SNAPPY}
                      onClick={() => props.onRun({ promptId: prompt.id })}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-xl py-1.5 text-left transition-opacity hover:opacity-65 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                        {running ? (
                          <Spinner className="h-5 w-5 text-[var(--brand)]" />
                        ) : (
                          <PromptIcon builtinKey={prompt.builtinKey} templateId={prompt.templateId} category={prompt.category} className="h-6 w-6" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[1.125rem]/6 font-semibold tracking-[-0.01em] text-[var(--ink)]">
                        {prompt.title}
                      </span>
                    </motion.button>

                    <Link
                      href={`/settings/edit-prompt/${prompt.id}`}
                      aria-label={`Edit ${prompt.title}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] opacity-0 transition-opacity hover:text-[var(--ink)] focus-visible:opacity-100 group-hover/prompt:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>

                    <motion.button
                      type="button"
                      whileTap={TAP_ICON}
                      onClick={() => props.onToggleFavorite(prompt)}
                      aria-label={prompt.isFavorite ? `Remove ${prompt.title} from favorites` : `Add ${prompt.title} to favorites`}
                      aria-pressed={prompt.isFavorite}
                      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[color,opacity] duration-150 ${
                        prompt.isFavorite
                          ? "text-[var(--warning)] opacity-100"
                          : "text-[var(--ink-subtle)] opacity-55 hover:opacity-100"
                      }`}
                    >
                      <motion.span
                        animate={{ scale: prompt.isFavorite ? [1, 1.25, 1] : 1 }}
                        transition={{ duration: 0.26, ease: EASE_OUT }}
                        className="inline-flex"
                      >
                        <Star className={`h-[1.125rem] w-[1.125rem] ${prompt.isFavorite ? "fill-current" : ""}`} strokeWidth={1.75} />
                      </motion.span>
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div className="pt-2">
          <p className="text-[0.9375rem] font-medium text-[var(--ink-muted)]">Need more?</p>
          <CurvedArrowDownIcon className="mt-1 h-7 w-7 text-[var(--ink-muted)]" />
        </div>
      </div>

      <div className="bg-[var(--surface-panel)]/95 px-5 pb-4 pt-2 backdrop-blur-md">
        <Accordion open={newOpen}>
          <div className="space-y-2.5 pb-3">
            <form onSubmit={submitInstruction} className="flex items-end gap-2">
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
                className="field min-h-[2.75rem] resize-none bg-[var(--surface-input)] py-2"
              />
              <button
                type="submit"
                disabled={disabled || !instruction.trim()}
                aria-label="Run custom instruction"
                className="btn btn-purple h-10 w-10 shrink-0 p-0"
              >
                {busyKey === "instruction" ? <Spinner /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings/edit-prompt/new" className="btn btn-secondary btn-sm">
                <Wand2 className="h-3.5 w-3.5" /> Create style
              </Link>
              {props.onOpenGallery ? (
                <button type="button" onClick={props.onOpenGallery} className="btn btn-secondary btn-sm">
                  Browse gallery
                </button>
              ) : (
                <Link href="/settings/gallery" className="btn btn-secondary btn-sm">
                  Browse gallery
                </Link>
              )}
            </div>
          </div>
        </Accordion>

        <Accordion open={searchOpen || Boolean(query)}>
          <div className="relative pb-3">
            <SearchLoopIcon className="pointer-events-none absolute left-3.5 top-[1.25rem] h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search options…"
              aria-label="Find a rewrite style"
              className="field rounded-full bg-[var(--surface-input)] pl-10 pr-8 text-sm"
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
          <motion.button
            type="button"
            whileTap={TAP_PRESS}
            onClick={() => {
              setNewOpen((open) => !open);
              setTimeout(() => customRef.current?.focus(), 20);
            }}
            aria-expanded={newOpen}
            className={`inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-5 text-[0.9375rem] font-semibold transition-colors duration-150 ${
              newOpen
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--cta-ink)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-xs hover:opacity-75 dark:border-[var(--border-strong)]/70 dark:bg-transparent dark:shadow-none"
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>New</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={TAP_ICON}
            onClick={() => {
              setSearchOpen((open) => !open || Boolean(query));
              setTimeout(() => searchRef.current?.focus(), 20);
            }}
            aria-label="Search rewrite styles"
            aria-pressed={searchOpen}
            className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 ${
              searchOpen || query
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-xs hover:opacity-75 dark:border-[var(--border-strong)]/70 dark:bg-transparent dark:shadow-none"
            }`}
          >
            <SearchLoopIcon className="h-5 w-5" />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
