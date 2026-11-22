import type { Tag } from "../lib/types.ts";
import { TAG_TITLE_MAX } from "../lib/limits.ts";
import { badRequest, conflict, notFound } from "./http.ts";
import { assertOk, isUniqueError, owned, supabase } from "./supabase.ts";

export const TAG_COLORS = [
  "#E11D48",
  "#EA580C",
  "#D97706",
  "#059669",
  "#0284C7",
  "#4F46E5",
  "#7C3AED",
  "#C026D3",
  "#0D9488",
  "#475569",
] as const;

interface TagRow {
  id: number;
  title: string;
  color: string;
  position: number;
  created_at: number;
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function cleanTitle(value: unknown): string {
  if (typeof value !== "string") throw badRequest("Tag name is required.");
  const title = value.trim().replace(/\s+/g, " ");
  if (!title) throw badRequest("Tag name cannot be empty.");
  if (title.length > TAG_TITLE_MAX) throw badRequest(`Tag names can be up to ${TAG_TITLE_MAX} characters.`);
  return title;
}

export async function listTags(userId: string): Promise<Tag[]> {
  const rows = assertOk(
    await owned(userId, "tags").select("*").order("position", { ascending: true }).order("id", { ascending: true }),
  ) as TagRow[];
  if (rows.length === 0) return [];
  const links = assertOk(
    await supabase()
      .from("note_tags")
      .select("tag_id, notes!inner(archived)")
      .eq("notes.archived", false)
      .eq("notes.user_id", userId)
      .in("tag_id", rows.map((row) => Number(row.id))),
  ) as unknown as Array<{ tag_id: number }>;
  const counts = new Map<number, number>();
  for (const link of links) counts.set(link.tag_id, (counts.get(link.tag_id) ?? 0) + 1);
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    color: row.color,
    position: row.position,
    noteCount: counts.get(Number(row.id)) ?? 0,
    createdAt: Number(row.created_at),
  }));
}

export async function tagExists(userId: string, id: number): Promise<boolean> {
  const { data } = await owned(userId, "tags").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

export async function createTag(userId: string, titleInput: unknown, colorInput: unknown): Promise<Tag> {
  const title = cleanTitle(titleInput);
  const existing = assertOk(await owned(userId, "tags").select("position")) as Array<{ position: number }>;
  const color =
    typeof colorInput === "string" && COLOR_PATTERN.test(colorInput)
      ? colorInput.toUpperCase()
      : TAG_COLORS[existing.length % TAG_COLORS.length];
  const nextPos = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const { data, error } = await owned(userId, "tags")
    .insert({ title, color, position: nextPos, created_at: Date.now() })
    .select("*")
    .single();
  if (error) {
    if (isUniqueError(error)) throw conflict("A tag with that name already exists.", "tag_exists");
    throw new Error(error.message);
  }
  const row = data as TagRow;
  return { id: Number(row.id), title: row.title, color: row.color, position: row.position, noteCount: 0, createdAt: Number(row.created_at) };
}

export async function updateTag(userId: string, id: number, patch: Record<string, unknown>): Promise<Tag> {
  if (!(await tagExists(userId, id))) throw notFound("Tag not found.");
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = cleanTitle(patch.title);
  if (patch.color !== undefined) {
    if (typeof patch.color !== "string" || !COLOR_PATTERN.test(patch.color)) throw badRequest("Pick a valid color.");
    updates.color = patch.color.toUpperCase();
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await owned(userId, "tags").update(updates).eq("id", id);
    if (error) {
      if (isUniqueError(error)) throw conflict("A tag with that name already exists.", "tag_exists");
      throw new Error(error.message);
    }
  }
  const all = await listTags(userId);
  return all.find((tag) => tag.id === id)!;
}

export async function deleteTag(userId: string, id: number): Promise<void> {
  const deleted = assertOk(await owned(userId, "tags").delete().eq("id", id).select("id")) as Array<{ id: number }>;
  if (deleted.length === 0) throw notFound("Tag not found.");
}

/** Saves a new tag order (ids listed first come first). Ids that belong to someone else are ignored. */
export async function reorderTags(userId: string, ids: number[]): Promise<Tag[]> {
  await Promise.all(ids.map((id, index) => owned(userId, "tags").update({ position: index }).eq("id", id)));
  return listTags(userId);
}
