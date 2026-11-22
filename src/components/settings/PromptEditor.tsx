"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { SPRING_SNAPPY } from "@/lib/motion";
import { renderPromptBody } from "@/lib/prompt-render";
import { PROMPT_CATEGORIES } from "@/lib/templates";
import type { Prompt, PromptProperty } from "@/lib/types";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { Accordion, Spinner, Switch } from "../ui";
import { PropertyFields, propertyValues, setPropertyValue } from "./PropertyFields";
import { SectionCard, SectionHeader } from "./SectionLayout";

const EXAMPLES = [
  "Turn this into a short, friendly message I can share with my team.",
  "Rewrite this as a numbered list of next steps, each starting with a verb.",
  "Summarize this in three clear bullet points and highlight key dates or decisions.",
];

export function PromptEditor({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const askConfirm = useConfirm();
  const isNew = id === "new";
  const [loaded, setLoaded] = useState(isNew);
  const [missing, setMissing] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Custom");
  const [body, setBody] = useState("");
  const [model, setModel] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [properties, setProperties] = useState<PromptProperty[]>([]);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api<{ prompt: Prompt }>(`/api/prompts/${id}`)
      .then(({ prompt: loadedPrompt }) => {
        setPrompt(loadedPrompt);
        setTitle(loadedPrompt.title);
        setDescription(loadedPrompt.description);
        setCategory(loadedPrompt.category);
        setBody(loadedPrompt.body);
        setModel(loadedPrompt.model ?? "");
        setFavorite(loadedPrompt.isFavorite);
        setProperties(loadedPrompt.properties);
        setLoaded(true);
      })
      .catch((error) => {
        if (error instanceof ApiError && (error.status === 404 || error.status === 400)) setMissing(true);
        else toast(errorMessage(error), "error");
      });
  }, [id, isNew, toast]);

  const preview = useMemo(() => renderPromptBody(body, properties), [body, properties]);
  const categories = useMemo(() => [...new Set([...PROMPT_CATEGORIES, category])], [category]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const json = { title, description, category, body, model: model.trim() || null, isFavorite: favorite };
      if (isNew) {
        await api("/api/prompts", { json });
      } else {
        await api(`/api/prompts/${id}`, {
          method: "PATCH",
          json: properties.length ? { ...json, propertyValues: propertyValues(properties) } : json,
        });
      }
      toast(isNew ? "Style created" : "Style saved");
      router.push("/settings/prompts");
    } catch (error) {
      toast(errorMessage(error), "error");
      setSaving(false);
    }
  }

  async function remove() {
    const confirmed = await askConfirm({
      title: "Delete this style?",
      subject: title,
      message: "Notes you already rewrote with it won't be affected.",
      confirmLabel: "Delete",
      tone: "danger",
      icon: Trash2,
    });
    if (!confirmed) return;
    try {
      await api(`/api/prompts/${id}`, { method: "DELETE" });
      toast("Style deleted");
      router.push("/settings/prompts");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  if (missing) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Style not found" description="It may have been deleted." />
        <Link href="/settings/prompts" className="btn btn-secondary">
          Back to rewrite styles
        </Link>
      </div>
    );
  }
  if (!loaded) return <div className="surface-card h-64 animate-pulse rounded-3xl" />;

  return (
    <form onSubmit={save} className="space-y-5">
      <Link href="/settings/prompts" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">
        <ArrowLeft className="h-3.5 w-3.5" /> All rewrite styles
      </Link>
      <SectionHeader
        title={isNew ? "New rewrite style" : `Edit "${prompt?.title ?? title}"`}
        description={
          prompt?.builtinKey
            ? "Built-in style. You can customize it anytime or restore defaults later."
            : prompt?.templateId
              ? "Saved from the gallery. Adjust the tone and details below."
              : "Describe how you'd like Saydraft to rewrite your note."
        }
      />

      <SectionCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Name
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required placeholder="e.g. Team update" className="field mt-1.5" />
          </label>
          <label className="block text-sm font-medium">
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="field mt-1.5">
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Short description <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="Shown under the style name" className="field mt-1.5" />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Instructions
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={8}
              maxLength={20000}
              placeholder={EXAMPLES[0]}
              className="field mt-1.5 min-h-[10rem] resize-y leading-relaxed"
            />
          </label>
        </div>
        {isNew && !body && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip py-1 text-xs" onClick={() => setBody(example)}>
                {example.slice(0, 48)}…
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {properties.length > 0 && (
        <SectionCard title="Style customization" description="Adjust tone, length, and formatting options.">
          <PropertyFields properties={properties} onChange={(key, value) => setProperties((current) => setPropertyValue(current, key, value))} />
        </SectionCard>
      )}

      <SectionCard>
        <Switch checked={favorite} onChange={setFavorite} label="Pin to Favorites" description="Pinned styles appear at the top of your Rewrite panel." />
      </SectionCard>

      <div className="surface-card rounded-3xl">
        <button
          type="button"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 p-5 text-left sm:px-6"
        >
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Advanced options</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Optional model override and full instruction preview.</p>
          </div>
          <motion.span animate={{ rotate: advancedOpen ? 180 : 0 }} transition={SPRING_SNAPPY} className="inline-flex shrink-0">
            <ChevronDown className="h-4 w-4 text-[var(--ink-muted)]" />
          </motion.span>
        </button>
        <Accordion open={advancedOpen}>
          <div className="space-y-4 border-t border-[var(--border)] px-5 pb-6 pt-5 sm:px-6">
            <label className="block">
              <span className="text-sm font-medium">Model override</span>
              <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Leave empty to use your default writing model from Preferences.</span>
              <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Default" className="field mt-2 font-mono text-[13px]" />
            </label>
            {properties.length > 0 && preview && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--ink-muted)]">Full instruction preview</p>
                <pre className="prose-note max-h-56 overflow-y-auto rounded-2xl bg-[var(--surface-subtle)] p-4 font-sans text-sm">{preview}</pre>
              </div>
            )}
          </div>
        </Accordion>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isNew ? (
          <button type="button" className="btn btn-ghost hover:!text-[var(--danger)]" onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Link href="/settings/prompts" className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving || !title.trim() || !body.trim()}>
            {saving && <Spinner className="h-3.5 w-3.5" />} {isNew ? "Create style" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
