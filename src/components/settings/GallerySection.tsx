"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { EASE_OUT } from "@/lib/motion";
import { renderPromptBody } from "@/lib/prompt-render";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates";
import type { Prompt, PromptProperty, Template } from "@/lib/types";
import { PromptIcon } from "../icons";
import { useToast } from "../Toast";
import { Dialog, Spinner } from "../ui";
import { PropertyFields, propertyValues, setPropertyValue } from "./PropertyFields";
import { SectionHeader } from "./SectionLayout";

const FEATURED_BANNERS = [
  {
    category: "Content Creation",
    title: "Content Creation",
    subtitle: "Easily craft posts, scripts, and blog articles",
    gradient: "from-[#f5c76b] via-[#e2955d] to-[#56484b]",
  },
  {
    category: "Journaling",
    title: "Journaling",
    subtitle: "Capture your thoughts, emotions, and growth with easy journaling prompts",
    gradient: "from-[#f29f67] via-[#b86778] to-[#2c3357]",
  },
] as const;

function TemplateDialog({
  template,
  added,
  onClose,
  onAdded,
}: {
  template: Template | null;
  added: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
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
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
            <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Pin to Favorites
          </label>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-purple" disabled={busy} onClick={() => void add()}>
            {busy && <Spinner className="h-3.5 w-3.5" />} {added ? "Add another copy" : "Add to my styles"}
          </button>
        </>
      }
    >
      {properties.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Customize</p>
          <PropertyFields properties={properties} onChange={(key, value) => setProperties((current) => setPropertyValue(current, key, value))} />
        </div>
      )}
      <p className="mb-2 text-sm font-semibold text-[var(--ink)]">How it rewrites</p>
      <pre className="prose-note max-h-72 overflow-y-auto rounded-2xl bg-[var(--surface-panel-card)] p-4 font-sans text-sm text-[var(--ink)]">{preview}</pre>
    </Dialog>
  );
}

export function GalleryContent({
  compact = false,
  onInstalled,
}: {
  compact?: boolean;
  onInstalled?: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Template | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const catRailRef = useRef<HTMLDivElement>(null);

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

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cats = category === "All" ? TEMPLATE_CATEGORIES : TEMPLATE_CATEGORIES.filter((c) => c === category);
    return cats
      .map((cat) => ({
        name: cat,
        items: TEMPLATES.filter(
          (template) =>
            template.category === cat &&
            (!q || template.title.toLowerCase().includes(q) || template.description.toLowerCase().includes(q) || template.category.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [category, query]);

  async function quickAdd(event: React.MouseEvent, template: Template) {
    event.stopPropagation();
    if (template.properties.length > 0) {
      setOpen(template);
      return;
    }
    try {
      await api(`/api/templates/${template.id}`, { json: { values: {}, favorite: true } });
      toast(`"${template.title}" added`);
      await loadAdded();
      onInstalled?.();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  return (
    <div className="space-y-6">
      {!compact && (
        <SectionHeader
          title="Rewrite options gallery"
          description={`${TEMPLATES.length} ready-made styles for emails, summaries, lists, and social posts.`}
        />
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search the gallery"
          className="field h-12 rounded-full border-transparent bg-[var(--surface-input)] pl-11 focus:border-[var(--brand)] focus:shadow-none"
        />
      </div>

      <div className="relative flex items-center gap-1.5">
        <div ref={catRailRef} className="no-scrollbar flex flex-1 gap-2 overflow-x-auto py-1">
          {TEMPLATE_CATEGORIES.map((name) => {
            const active = category === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory((cur) => (cur === name ? "All" : name))}
                className={`flex min-w-[5rem] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-medium transition-colors duration-150 ${
                  active
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                    : "bg-[var(--surface)]/45 text-[var(--ink)] hover:bg-[var(--surface)]/80"
                }`}
              >
                <PromptIcon category={name} className="h-6 w-6" />
                <span className="whitespace-nowrap">{name}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Scroll categories"
          onClick={() => catRailRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
          className="hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--surface-panel-card)] text-[var(--ink)] hover:opacity-75 sm:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

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
            <div className="grid gap-3.5 sm:grid-cols-2">
              {FEATURED_BANNERS.map((banner) => (
                <button
                  key={banner.category}
                  type="button"
                  onClick={() => setCategory(banner.category)}
                  className={`relative flex min-h-[11.5rem] cursor-pointer flex-col justify-end overflow-hidden rounded-[1.5rem] bg-gradient-to-br p-5 text-left text-[#fef8fb] transition-transform duration-150 hover:scale-[0.992] ${banner.gradient}`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
                  <span className="relative z-10 text-lg font-bold tracking-tight">{banner.title}</span>
                  <span className="relative z-10 mt-0.5 text-xs leading-snug text-white/90">{banner.subtitle}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-7">
        {sections.map((section) => (
          <section key={section.name}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2.5 text-[1.25rem] font-bold tracking-tight text-[var(--ink)]">
                <PromptIcon category={section.name} className="h-6 w-6" />
                <span>{section.name}</span>
              </h3>
              {category !== "All" && (
                <button
                  type="button"
                  onClick={() => setCategory("All")}
                  className="cursor-pointer text-xs font-semibold text-[var(--brand)] hover:underline"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
              {section.items.map((template) => {
                const added = addedIds.has(template.id);
                return (
                  <div
                    key={template.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(template)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpen(template);
                      }
                    }}
                    className="flex min-h-[12.25rem] w-[10.5rem] shrink-0 cursor-pointer flex-col rounded-[1.5rem] bg-[var(--surface-panel-card)] p-4 text-left transition-opacity duration-150 hover:opacity-90"
                  >
                    <PromptIcon templateId={template.id} category={template.category} className="h-6 w-6" />
                    <span className="mt-3 line-clamp-2 text-[0.9375rem]/snug font-bold text-[var(--ink)]">{template.title}</span>
                    <span className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--ink-subtle)]">{template.description}</span>
                    <button
                      type="button"
                      onClick={(event) => void quickAdd(event, template)}
                      className={`mt-auto inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                        added
                          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                          : "bg-[var(--border-strong)]/40 text-[var(--ink)] hover:bg-[var(--border-strong)]/60"
                      }`}
                    >
                      {added ? (
                        <>
                          <Check className="h-3 w-3" /> Added
                        </>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {sections.length === 0 && <p className="py-10 text-center text-sm text-[var(--ink-muted)]">No styles match “{query}”.</p>}
      </div>

      <TemplateDialog
        template={open}
        added={open ? addedIds.has(open.id) : false}
        onClose={() => setOpen(null)}
        onAdded={() => {
          void loadAdded();
          onInstalled?.();
        }}
      />
    </div>
  );
}

export function GallerySection() {
  return <GalleryContent />;
}

export function GalleryModal({
  open,
  onClose,
  onInstalled,
}: {
  open: boolean;
  onClose: () => void;
  onInstalled?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Rewrite options gallery" centeredHeader size="xl">
      <GalleryContent compact onInstalled={onInstalled} />
    </Dialog>
  );
}
