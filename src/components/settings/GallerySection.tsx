"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY } from "@/lib/motion";
import { renderPromptBody } from "@/lib/prompt-render";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates";
import type { Prompt, PromptProperty, Template } from "@/lib/types";
import { useToast } from "../Toast";
import { Dialog, Spinner } from "../ui";
import { PropertyFields, propertyValues, setPropertyValue } from "./PropertyFields";
import { SectionHeader } from "./SectionLayout";

const FEATURED_STYLES = [
  "bg-[var(--banner-sky)] text-[#01050f]",
  "bg-[#5b3aed] text-[#fef8fb]",
  "bg-[var(--surface-panel-card)] text-[var(--ink)]",
];

function TemplateDialog({ template, added, onClose, onAdded }: { template: Template | null; added: boolean; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [properties, setProperties] = useState<PromptProperty[]>([]);
  const [favorite, setFavorite] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (template) {
      setProperties(template.properties);
      setFavorite(true);
    }
  }, [template]);

  if (!template) return null;
  const preview = renderPromptBody(template.body, properties);

  async function add() {
    if (!template) return;
    setBusy(true);
    try {
      await api(`/api/templates/${template.id}`, { json: { values: propertyValues(properties), favorite } });
      toast(`"${template.title}" added to your rewrite styles`);
      onAdded();
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={template.title}
      description={`${template.category} · ${template.description}`}
      size="lg"
      footer={
        <>
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Pin to Favorites
          </label>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>
            {busy && <Spinner className="h-3.5 w-3.5" />} {added ? "Add another copy" : "Add to my styles"}
          </button>
        </>
      }
    >
      {properties.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold">Customize</p>
          <PropertyFields properties={properties} onChange={(key, value) => setProperties((current) => setPropertyValue(current, key, value))} />
        </div>
      )}
      <p className="mb-2 text-sm font-semibold">How it rewrites</p>
      <pre className="prose-note max-h-72 overflow-y-auto rounded-2xl bg-[var(--surface-subtle)] p-4 font-sans text-sm">{preview}</pre>
    </Dialog>
  );
}

export function GallerySection() {
  const toast = useToast();
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Template | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const loadAdded = useCallback(async () => {
    try {
      const { prompts } = await api<{ prompts: Prompt[] }>("/api/prompts");
      setAddedIds(new Set(prompts.map((prompt) => prompt.templateId).filter((id): id is string => Boolean(id))));
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }, [toast]);
  useEffect(() => {
    void loadAdded();
  }, [loadAdded]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter(
      (template) =>
        (category === "All" || template.category === category) &&
        (!q || template.title.toLowerCase().includes(q) || template.description.toLowerCase().includes(q) || template.category.toLowerCase().includes(q)),
    );
  }, [category, query]);
  const featured = TEMPLATES.filter((template) => template.featured);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Rewrite Options Gallery"
        description={`${TEMPLATES.length} ready-made styles for emails, summaries, lists, and social posts. Save your favorites to use inside any note.`}
      />

      <AnimatePresence initial={false}>
        {category === "All" && !query && (
          <motion.div
            key="featured"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((template, index) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setOpen(template)}
                  className={`cursor-pointer rounded-[1.75rem] p-5 text-left transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.985] ${
                    FEATURED_STYLES[index % FEATURED_STYLES.length]
                  }`}
                >
                  <span className="inline-flex items-center gap-1 text-xs font-medium opacity-80">
                    <Sparkles className="h-3.5 w-3.5" /> Featured · {template.category}
                  </span>
                  <span className="mt-1.5 block text-base font-bold">{template.title}</span>
                  <span className="mt-1 block text-sm opacity-85">{template.description}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search styles…"
            aria-label="Search the gallery"
            className="field rounded-full bg-[var(--surface)] pl-10"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {["All", ...TEMPLATE_CATEGORIES].map((name) => {
            const active = category === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(name)}
                className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  active
                    ? "border-transparent text-[var(--accent-ink)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="gallery-cat-pill"
                    transition={SPRING_SNAPPY}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[var(--accent)]"
                  />
                )}
                <span className="relative z-10">{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="grid gap-3.5 sm:grid-cols-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((template) => (
            <motion.li
              key={template.id}
              layout="position"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SMOOTH}
            >
              <button
                type="button"
                onClick={() => setOpen(template)}
                className="surface-card flex h-full w-full cursor-pointer flex-col rounded-[1.75rem] p-5 text-left transition-[background-color,transform] duration-150 hover:bg-[var(--surface-hover)] active:scale-[0.99]"
              >
                <span className="flex items-center gap-2">
                  <span className="flex-1 text-base font-semibold text-[var(--ink)]">{template.title}</span>
                  {addedIds.has(template.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand)]">
                      <Check className="h-3 w-3" /> Saved
                    </span>
                  )}
                </span>
                <span className="mt-1 text-sm text-[var(--ink-muted)]">{template.description}</span>
                <span className="mt-3 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                  {template.category}
                  {template.properties.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · <SlidersHorizontal className="h-3 w-3" /> Customizable
                    </span>
                  )}
                </span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {visible.length === 0 && <p className="py-10 text-center text-sm text-[var(--ink-muted)]">No styles match “{query}”.</p>}

      <TemplateDialog template={open} added={open ? addedIds.has(open.id) : false} onClose={() => setOpen(null)} onAdded={() => void loadAdded()} />
    </div>
  );
}
