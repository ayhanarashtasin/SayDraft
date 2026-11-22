import type { Prompt, PromptProperty } from "../lib/types.ts";
import { PROMPT_BODY_MAX } from "../lib/limits.ts";
import { applyPropertyValues, sanitizeProperties } from "../lib/prompt-render.ts";
import { DEFAULT_PROMPTS, PROMPT_CATEGORIES, findTemplate } from "../lib/templates.ts";
import { badRequest, notFound } from "./http.ts";
import { forgetPromptInSettings } from "./settings.ts";
import { assertOk, ensurePrompts, supabase } from "./supabase.ts";

interface PromptRow {
  id: number;
  title: string;
  description: string;
  category: string;
  body: string;
  properties: unknown;
  model: string | null;
  builtin_key: string | null;
  template_id: string | null;
  is_favorite: boolean;
  position: number;
  created_at: number;
  updated_at: number;
}

function parseProperties(raw: unknown): PromptProperty[] {
  if (Array.isArray(raw)) return raw as PromptProperty[];
  if (typeof raw === "string") {
    try {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value) ? (value as PromptProperty[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toPrompt(row: PromptRow): Prompt {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    category: row.category,
    body: row.body,
    properties: parseProperties(row.properties),
    model: row.model,
    builtinKey: row.builtin_key,
    templateId: row.template_id,
    isFavorite: Boolean(row.is_favorite),
    position: row.position,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const CATEGORY_ORDER = new Map<string, number>(PROMPT_CATEGORIES.map((category, index) => [category, index]));

export async function listPrompts(): Promise<Prompt[]> {
  await ensurePrompts();
  const rows = assertOk(
    await supabase().from("prompts").select("*").order("position", { ascending: true }).order("id", { ascending: true }),
  ) as PromptRow[];
  return rows
    .map(toPrompt)
    .sort((a, b) => (CATEGORY_ORDER.get(a.category) ?? 99) - (CATEGORY_ORDER.get(b.category) ?? 99) || a.position - b.position || a.id - b.id);
}

export async function getPrompt(id: number): Promise<Prompt | null> {
  await ensurePrompts();
  const row = assertOk(await supabase().from("prompts").select("*").eq("id", id).maybeSingle()) as PromptRow | null;
  return row ? toPrompt(row) : null;
}

export async function requirePrompt(id: number): Promise<Prompt> {
  const prompt = await getPrompt(id);
  if (!prompt) throw notFound("Prompt not found.");
  return prompt;
}

export async function promptExists(id: number): Promise<boolean> {
  await ensurePrompts();
  const { data } = await supabase().from("prompts").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

function cleanText(value: unknown, field: string, max: number, required: boolean): string {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const text = value.trim();
  if (required && !text) throw badRequest(`${field} is required.`);
  if (text.length > max) throw badRequest(`${field} can be up to ${max.toLocaleString("en-US")} characters.`);
  return text;
}

function cleanCategory(value: unknown): string {
  const category = cleanText(value, "Category", 40, false);
  return category || "Custom";
}

function cleanModel(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9._:/@+-]{1,120}$/.test(value.trim())) {
    throw badRequest("Model must be a valid model name, or left empty to use the default.");
  }
  return value.trim();
}

async function nextPosition(): Promise<number> {
  const rows = assertOk(await supabase().from("prompts").select("position")) as Array<{ position: number }>;
  return rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;
}

export async function createPrompt(input: Record<string, unknown>): Promise<Prompt> {
  await ensurePrompts();
  const now = Date.now();
  const row = assertOk(
    await supabase()
      .from("prompts")
      .insert({
        title: cleanText(input.title, "Title", 80, true),
        description: cleanText(input.description, "Description", 200, false),
        category: cleanCategory(input.category),
        body: cleanText(input.body, "Prompt", PROMPT_BODY_MAX, true),
        properties: sanitizeProperties(input.properties),
        model: cleanModel(input.model),
        is_favorite: input.isFavorite === true,
        position: await nextPosition(),
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single(),
  ) as PromptRow;
  return toPrompt(row);
}

export async function updatePrompt(id: number, patch: Record<string, unknown>): Promise<Prompt> {
  const existing = await requirePrompt(id);
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = cleanText(patch.title, "Title", 80, true);
  if (patch.description !== undefined) updates.description = cleanText(patch.description, "Description", 200, false);
  if (patch.category !== undefined) updates.category = cleanCategory(patch.category);
  if (patch.body !== undefined) updates.body = cleanText(patch.body, "Prompt", PROMPT_BODY_MAX, true);
  if (patch.model !== undefined) updates.model = cleanModel(patch.model);
  if (patch.isFavorite !== undefined) {
    if (typeof patch.isFavorite !== "boolean") throw badRequest("isFavorite must be true or false.");
    updates.is_favorite = patch.isFavorite;
  }
  if (patch.propertyValues !== undefined) {
    if (!patch.propertyValues || typeof patch.propertyValues !== "object" || Array.isArray(patch.propertyValues)) {
      throw badRequest("propertyValues must be an object.");
    }
    updates.properties = applyPropertyValues(existing.properties, patch.propertyValues as Record<string, unknown>);
  } else if (patch.properties !== undefined) {
    updates.properties = sanitizeProperties(patch.properties);
  }
  if (Object.keys(updates).length === 0) return existing;
  updates.updated_at = Date.now();
  const row = assertOk(await supabase().from("prompts").update(updates).eq("id", id).select("*").single()) as PromptRow;
  return toPrompt(row);
}

export async function deletePrompt(id: number): Promise<void> {
  const deleted = assertOk(await supabase().from("prompts").delete().eq("id", id).select("id")) as Array<{ id: number }>;
  if (deleted.length === 0) throw notFound("Prompt not found.");
  await forgetPromptInSettings(id);
}

/** Moves a prompt one step up or down within its category. */
export async function movePrompt(id: number, direction: "up" | "down"): Promise<Prompt[]> {
  const prompt = await requirePrompt(id);
  const siblings = (await listPrompts()).filter((item) => item.category === prompt.category);
  const index = siblings.findIndex((item) => item.id === id);
  const swapWith = siblings[direction === "up" ? index - 1 : index + 1];
  if (swapWith) {
    const ordered = siblings.map((item) => item.id);
    [ordered[index], ordered[siblings.indexOf(swapWith)]] = [swapWith.id, id];
    const base = Math.min(...siblings.map((item) => item.position));
    await Promise.all(ordered.map((promptId, offset) => supabase().from("prompts").update({ position: base + offset }).eq("id", promptId)));
  }
  return listPrompts();
}

export async function restoreDefaultPrompts(): Promise<number> {
  await ensurePrompts();
  const existing = assertOk(await supabase().from("prompts").select("builtin_key")) as Array<{ builtin_key: string | null }>;
  const keys = new Set(existing.map((row) => row.builtin_key).filter((k): k is string => Boolean(k)));
  const now = Date.now();
  const missing = DEFAULT_PROMPTS.map((prompt, index) => ({ prompt, index })).filter(({ prompt }) => !keys.has(prompt.builtinKey));
  if (missing.length === 0) return 0;
  const inserted = assertOk(
    await supabase().from("prompts").upsert(
      missing.map(({ prompt, index }) => ({
        title: prompt.title,
        description: prompt.description,
        category: prompt.category,
        body: prompt.body,
        properties: [],
        builtin_key: prompt.builtinKey,
        position: index,
        created_at: now,
        updated_at: now,
      })), { onConflict: "builtin_key", ignoreDuplicates: true },
    ).select("id"),
  );
  return inserted?.length ?? 0;
}

/** Creates a user prompt from a gallery template with the chosen property values. */
export async function promptFromTemplate(
  templateId: string,
  values: Record<string, unknown> | undefined,
  favorite: boolean,
): Promise<Prompt> {
  await ensurePrompts();
  const template = findTemplate(templateId);
  if (!template) throw notFound("Template not found.");
  const now = Date.now();
  const row = assertOk(
    await supabase()
      .from("prompts")
      .insert({
        title: template.title,
        description: template.description,
        category: template.category,
        body: template.body,
        properties: applyPropertyValues(template.properties, values),
        template_id: template.id,
        is_favorite: favorite,
        position: await nextPosition(),
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single(),
  ) as PromptRow;
  return toPrompt(row);
}
