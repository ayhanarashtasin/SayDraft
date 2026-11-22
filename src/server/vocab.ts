import type { DictionaryEntry, Replacement } from "../lib/types.ts";
import { DICTIONARY_WORD_MAX, DICTIONARY_WORDS_MAX } from "../lib/limits.ts";
import { badRequest, conflict, notFound } from "./http.ts";
import { assertOk, isUniqueError, supabase } from "./supabase.ts";

// ---------------------------------------------------------------- dictionary

interface DictionaryRow {
  id: number;
  word: string;
  created_at: number;
}

export async function listDictionary(): Promise<DictionaryEntry[]> {
  const rows = assertOk(await supabase().from("dictionary").select("*")) as DictionaryRow[];
  return rows
    .map((row) => ({ id: Number(row.id), word: row.word, createdAt: Number(row.created_at) }))
    .sort((a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: "base" }));
}

export function validateDictionaryWord(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Enter a word or short phrase.");
  const word = raw.trim().replace(/\s+/g, " ");
  if (!word) throw badRequest("Enter a word or short phrase.");
  if (word.length > DICTIONARY_WORD_MAX) throw badRequest(`Dictionary entries can be up to ${DICTIONARY_WORD_MAX} characters.`);
  if (word.split(" ").length > DICTIONARY_WORDS_MAX) throw badRequest(`Dictionary entries can be up to ${DICTIONARY_WORDS_MAX} words.`);
  return word;
}

/** Adds words, skipping duplicates. Returns how many were new. */
export async function addDictionaryWords(rawWords: unknown[]): Promise<{ added: number; entries: DictionaryEntry[] }> {
  if (rawWords.length > 100) throw badRequest("Add up to 100 entries at a time.");
  const words = rawWords.map(validateDictionaryWord);
  const existing = await listDictionary();
  const seen = new Set(existing.map((entry) => entry.word.toLowerCase()));
  const now = Date.now();
  const toInsert: Array<{ word: string; created_at: number }> = [];
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    toInsert.push({ word, created_at: now });
  }
  if (toInsert.length > 0) {
    assertOk(await supabase().from("dictionary").insert(toInsert));
  }
  return { added: toInsert.length, entries: await listDictionary() };
}

export async function updateDictionaryWord(id: number, raw: unknown): Promise<DictionaryEntry> {
  const word = validateDictionaryWord(raw);
  const { data, error } = await supabase().from("dictionary").update({ word }).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (isUniqueError(error)) throw conflict("That word is already in your dictionary.");
    throw new Error(error.message);
  }
  if (!data) throw notFound("Dictionary entry not found.");
  const row = data as DictionaryRow;
  return { id: Number(row.id), word: row.word, createdAt: Number(row.created_at) };
}

export async function deleteDictionaryWord(id: number): Promise<void> {
  const deleted = assertOk(await supabase().from("dictionary").delete().eq("id", id).select("id")) as Array<{ id: number }>;
  if (deleted.length === 0) throw notFound("Dictionary entry not found.");
}

/** A short vocabulary hint for the transcription model. */
export async function dictionaryPrompt(maxChars = 900): Promise<string | undefined> {
  const words: string[] = [];
  let length = 0;
  for (const entry of await listDictionary()) {
    if (length + entry.word.length + 2 > maxChars) break;
    words.push(entry.word);
    length += entry.word.length + 2;
  }
  return words.length ? `Names and terms that may appear: ${words.join(", ")}.` : undefined;
}

// ---------------------------------------------------------------- text replacements

interface ReplacementRow {
  id: number;
  find: string;
  replace_with: string;
  is_active: boolean;
  created_at: number;
}

function toReplacement(row: ReplacementRow): Replacement {
  return {
    id: Number(row.id),
    find: row.find,
    replaceWith: row.replace_with,
    isActive: Boolean(row.is_active),
    createdAt: Number(row.created_at),
  };
}

export async function listReplacements(): Promise<Replacement[]> {
  const rows = assertOk(await supabase().from("replacements").select("*")) as ReplacementRow[];
  return rows.map(toReplacement).sort((a, b) => a.find.localeCompare(b.find, undefined, { sensitivity: "base" }));
}

function cleanFind(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw badRequest("Enter the text to replace.");
  const find = raw.trim();
  if (find.length > 100) throw badRequest("The text to replace can be up to 100 characters.");
  return find;
}

function cleanReplaceWith(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Enter the replacement text.");
  if (raw.length > 500) throw badRequest("Replacement text can be up to 500 characters.");
  return raw.trim();
}

export async function createReplacement(input: Record<string, unknown>): Promise<Replacement> {
  const { data, error } = await supabase()
    .from("replacements")
    .insert({
      find: cleanFind(input.find),
      replace_with: cleanReplaceWith(input.replaceWith),
      is_active: input.isActive !== false,
      created_at: Date.now(),
    })
    .select("*")
    .single();
  if (error) {
    if (isUniqueError(error)) throw conflict("There is already a replacement for that text.");
    throw new Error(error.message);
  }
  return toReplacement(data as ReplacementRow);
}

export async function updateReplacement(id: number, patch: Record<string, unknown>): Promise<Replacement> {
  const existing = assertOk(
    await supabase().from("replacements").select("*").eq("id", id).maybeSingle(),
  ) as ReplacementRow | null;
  if (!existing) throw notFound("Replacement not found.");
  const find = patch.find === undefined ? existing.find : cleanFind(patch.find);
  const replaceWith = patch.replaceWith === undefined ? existing.replace_with : cleanReplaceWith(patch.replaceWith);
  let isActive = existing.is_active;
  if (patch.isActive !== undefined) {
    if (typeof patch.isActive !== "boolean") throw badRequest("isActive must be true or false.");
    isActive = patch.isActive;
  }
  const { data, error } = await supabase()
    .from("replacements")
    .update({ find, replace_with: replaceWith, is_active: isActive })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (isUniqueError(error)) throw conflict("There is already a replacement for that text.");
    throw new Error(error.message);
  }
  return toReplacement(data as ReplacementRow);
}

export async function deleteReplacement(id: number): Promise<void> {
  const deleted = assertOk(await supabase().from("replacements").delete().eq("id", id).select("id")) as Array<{ id: number }>;
  if (deleted.length === 0) throw notFound("Replacement not found.");
}
