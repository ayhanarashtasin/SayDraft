import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROMPTS } from "../lib/templates.ts";
import { HttpError } from "./http.ts";

export const AUDIO_BUCKET = "audio";

const globalState = globalThis as typeof globalThis & {
  __saydraftSupabase?: SupabaseClient;
  __saydraftSeeded?: Map<string, Promise<void>>;
};

function resolveConfig(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in your environment.");
  }
  return { url, key };
}

/** The project URL and the public (publishable) key that Supabase Auth needs. Used on the server only. */
export function authConfig(): { url: string; key: string } {
  const { url } = resolveConfig();
  const key = (
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  ).trim();
  if (!key) {
    throw new Error("Sign-in is not configured. Set SUPABASE_PUBLISHABLE_KEY (the project's publishable key) in your environment.");
  }
  return { url, key };
}

/**
 * The service-role client. It bypasses row level security, so it must never be used on a table of
 * user data without an owner filter: use owned() for those tables.
 */
export function supabase(): SupabaseClient {
  if (!globalState.__saydraftSupabase) {
    const { url, key } = resolveConfig();
    globalState.__saydraftSupabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalState.__saydraftSupabase;
}

export function tempDir(): string {
  const dir = path.join(os.tmpdir(), "saydraft");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function assertOk<T>(result: { data: T; error: { message: string; code?: string } | null }, context?: string): T {
  if (result.error) {
    throw new Error(context ? `${context}: ${result.error.message}` : result.error.message);
  }
  return result.data;
}

export function assertWorkspaceWrite<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  const { error } = result;
  if (error?.code === "PT400") throw new HttpError(400, "bad_request", error.message);
  if (error?.code === "PT404") throw new HttpError(404, "not_found", error.message);
  if (error?.code === "PT409") throw new HttpError(409, "note_busy", error.message);
  return assertOk(result);
}

export function isUniqueError(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? "")));
}

/** The tables that hold one user's data. Their rows carry a user_id. */
export type OwnedTable = "notes" | "tags" | "prompts" | "dictionary" | "replacements" | "actions" | "settings";

interface SelectOptions {
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
}

/**
 * Query builders for one user's rows. Reads, updates and deletes only ever see that user's rows, and
 * inserts are stamped with the owner, so a query cannot forget the owner filter. (Child tables such as
 * audio_files, note_tags and rewrites are reached through a note whose owner was checked first.)
 */
export function owned(userId: string, table: OwnedTable) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  }
  type Row = Record<string, unknown>;
  const stamp = (rows: Row | Row[]) => (Array.isArray(rows) ? rows.map((row) => ({ ...row, user_id: userId })) : { ...rows, user_id: userId });
  const from = () => supabase().from(table);
  return {
    select: (columns = "*", options?: SelectOptions) => from().select<"*">(columns as "*", options).eq("user_id", userId),
    insert: (rows: Row | Row[]) => from().insert(stamp(rows)),
    upsert: (rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => from().upsert(stamp(rows), options),
    update: (values: Row) => from().update(values).eq("user_id", userId),
    delete: () => from().delete().eq("user_id", userId),
  };
}

/** Gives a new account its built-in prompts once, including when several instances start together. */
export function ensurePrompts(userId: string): Promise<void> {
  const seeded = (globalState.__saydraftSeeded ??= new Map());
  let boot = seeded.get(userId);
  if (!boot) {
    boot = (async () => {
      const marker = "default_prompts_initialized";
      if (assertOk(await owned(userId, "settings").select("key").eq("key", marker).maybeSingle())) return;
      const existing = assertOk(await owned(userId, "prompts").select("id").limit(1));
      if (!existing?.length) {
        const now = Date.now();
        assertOk(await owned(userId, "prompts").upsert(
          DEFAULT_PROMPTS.map((prompt, index) => ({
            title: prompt.title,
            description: prompt.description,
            category: prompt.category,
            body: prompt.body,
            properties: [],
            builtin_key: prompt.builtinKey,
            position: index,
            created_at: now,
            updated_at: now,
          })), { onConflict: "user_id,builtin_key", ignoreDuplicates: true },
        ));
      }
      assertOk(await owned(userId, "settings").upsert({ key: marker, value: "true" }, { onConflict: "user_id,key", ignoreDuplicates: true }));
    })().catch((error) => {
      seeded.delete(userId);
      throw error;
    });
    seeded.set(userId, boot);
  }
  return boot;
}

// ------------------------------------------------------------------ storage helpers

export async function uploadAudioObject(fileName: string, data: Blob, mime: string): Promise<void> {
  const { error } = await supabase().storage.from(AUDIO_BUCKET).upload(fileName, data, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(`Audio upload failed: ${error.message}`);
}

export async function streamAudioObject(fileName: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array> | null> {
  const signedUrl = await createAudioSignedUrl(fileName);
  if (!signedUrl) return null;
  const response = await fetch(signedUrl, { cache: "no-store", signal });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) return null;
    throw new Error(`Could not read audio from storage (HTTP ${response.status}).`);
  }
  return response.body;
}

export async function downloadAudioToFile(fileName: string, destPath: string, signal?: AbortSignal): Promise<boolean> {
  const body = await streamAudioObject(fileName, signal);
  if (!body) return false;
  await pipeline(Readable.from(body), fs.createWriteStream(destPath), { signal });
  return true;
}

export async function copyAudioObject(fromName: string, toName: string): Promise<void> {
  const { error } = await supabase().storage.from(AUDIO_BUCKET).copy(fromName, toName);
  if (error) throw new Error(`Could not copy audio: ${error.message}`);
}

export async function deleteAudioObject(fileName: string | null | undefined): Promise<void> {
  if (!fileName) return;
  try {
    const { error } = await supabase().storage.from(AUDIO_BUCKET).remove([fileName]);
    if (error) console.warn("Could not remove audio object:", error.message);
  } catch (error) {
    console.warn("Could not remove audio object:", error instanceof Error ? error.message : error);
  }
}

export async function createAudioSignedUrl(fileName: string, expiresInSec = 300): Promise<string | null> {
  const { data, error } = await supabase().storage.from(AUDIO_BUCKET).createSignedUrl(fileName, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
