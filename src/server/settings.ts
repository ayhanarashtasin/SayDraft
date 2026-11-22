import type { AppSettings } from "../lib/types.ts";
import { isLanguageCode } from "../lib/languages.ts";
import { badRequest } from "./http.ts";
import { assertOk, supabase } from "./supabase.ts";

const MODEL_PATTERN = /^[A-Za-z0-9._:/@+-]{1,120}$/;

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined ? undefined : value.trim();
}

export function defaultSettings(): AppSettings {
  return {
    transcribeModel: envValue("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe",
    rewriteModel: envValue("OPENAI_REWRITE_MODEL") || "gpt-4.1-mini",
    diarizeModel: envValue("OPENAI_DIARIZE_MODEL") ?? "gpt-4o-transcribe-diarize",
    defaultLanguage: "auto",
    autoTitle: true,
    autoReplacements: true,
    useDictionary: true,
    autoRewritePromptId: null,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const settings = defaultSettings();
  const rows = assertOk(await supabase().from("settings").select("key, value")) as Array<{ key: string; value: string }>;
  const record = settings as unknown as Record<string, unknown>;
  for (const row of rows) {
    if (!(row.key in settings)) continue;
    try {
      record[row.key] = JSON.parse(row.value);
    } catch {
      // Ignore a corrupt value and keep the default.
    }
  }
  return settings;
}

function validModel(value: unknown, field: string, allowEmpty: boolean): string {
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const model = value.trim();
  if (!model && allowEmpty) return "";
  if (!MODEL_PATTERN.test(model)) throw badRequest(`${field} is not a valid model name.`);
  return model;
}

export async function updateSettings(
  patch: Record<string, unknown>,
  promptExists: (id: number) => Promise<boolean>,
): Promise<AppSettings> {
  const changes: Partial<AppSettings> = {};
  if (patch.transcribeModel !== undefined) changes.transcribeModel = validModel(patch.transcribeModel, "Transcription model", false);
  if (patch.rewriteModel !== undefined) changes.rewriteModel = validModel(patch.rewriteModel, "Rewrite model", false);
  if (patch.diarizeModel !== undefined) changes.diarizeModel = validModel(patch.diarizeModel, "Speaker separation model", true);
  if (patch.defaultLanguage !== undefined) {
    if (patch.defaultLanguage !== "auto" && !isLanguageCode(patch.defaultLanguage)) {
      throw badRequest("Unknown speaker language.");
    }
    changes.defaultLanguage = patch.defaultLanguage as string;
  }
  for (const key of ["autoTitle", "autoReplacements", "useDictionary"] as const) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== "boolean") throw badRequest(`${key} must be true or false.`);
    changes[key] = patch[key] as boolean;
  }
  if (patch.autoRewritePromptId !== undefined) {
    const value = patch.autoRewritePromptId;
    if (value === null) changes.autoRewritePromptId = null;
    else {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0 || !(await promptExists(id))) {
        throw badRequest("Choose an existing prompt for auto-rewrite.");
      }
      changes.autoRewritePromptId = id;
    }
  }
  const rows = Object.entries(changes).map(([key, value]) => ({ key, value: JSON.stringify(value) }));
  if (rows.length > 0) {
    assertOk(await supabase().from("settings").upsert(rows, { onConflict: "key" }));
  }
  return getSettings();
}

/** Clears the auto-rewrite prompt if it points at a prompt that no longer exists. */
export async function forgetPromptInSettings(promptId: number): Promise<void> {
  const settings = await getSettings();
  if (settings.autoRewritePromptId === promptId) {
    assertOk(
      await supabase().from("settings").upsert([{ key: "autoRewritePromptId", value: "null" }], { onConflict: "key" }),
    );
  }
}
