import type { ActionType, IntegrationAction, Note, Rewrite } from "../lib/types.ts";
import { HttpError, badRequest, notFound } from "./http.ts";
import { getNote, getRewrite } from "./notes.ts";
import { assertOk, supabase } from "./supabase.ts";

interface ActionRow {
  id: number;
  type: ActionType;
  title: string;
  config: unknown;
  on_transcript: boolean;
  on_rewrite: boolean;
  last_status: "ok" | "error" | null;
  last_error: string | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ActionConfig {
  url?: string;
  token?: string;
  pageId?: string;
}

function parseConfig(raw: unknown): ActionConfig {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as ActionConfig;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ActionConfig;
    } catch {
      return {};
    }
  }
  return {};
}

function toAction(row: ActionRow): IntegrationAction {
  const config = parseConfig(row.config);
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    target: row.type === "webhook" ? config.url ?? "" : config.pageId ?? "",
    hasToken: Boolean(config.token),
    onTranscript: Boolean(row.on_transcript),
    onRewrite: Boolean(row.on_rewrite),
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastRunAt: row.last_run_at ? Number(row.last_run_at) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function getRow(id: number): Promise<ActionRow> {
  const row = assertOk(await supabase().from("actions").select("*").eq("id", id).maybeSingle()) as ActionRow | null;
  if (!row) throw notFound("Integration not found.");
  return row;
}

export async function listActions(): Promise<IntegrationAction[]> {
  const rows = assertOk(await supabase().from("actions").select("*").order("id", { ascending: true })) as ActionRow[];
  return rows.map(toAction);
}

function cleanUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw badRequest("Enter the webhook URL.");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest("Enter a valid URL starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw badRequest("Webhook URLs must start with https:// or http://");
  return url.toString();
}

/** Accepts a Notion page URL or id and returns the 32-character page id. */
export function parseNotionPageId(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Enter the Notion page link.");
  const compact = raw.trim().split("?")[0].replace(/-/g, "");
  const match = /([0-9a-f]{32})$/i.exec(compact);
  if (!match) throw badRequest("That doesn't look like a Notion page link. Copy the link of the page you shared with your integration.");
  const id = match[1].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function cleanTitle(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") throw badRequest("Name must be text.");
  return raw.trim().slice(0, 60) || fallback;
}

function bool(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`${field} must be true or false.`);
  return value;
}

export async function createAction(input: Record<string, unknown>): Promise<IntegrationAction> {
  const type = input.type === "notion" ? "notion" : input.type === "webhook" ? "webhook" : null;
  if (!type) throw badRequest("Choose a webhook or Notion integration.");
  const config: ActionConfig = {};
  if (type === "webhook") config.url = cleanUrl(input.url);
  else {
    if (typeof input.token !== "string" || !input.token.trim()) throw badRequest("Enter your Notion integration secret.");
    config.token = input.token.trim();
    config.pageId = parseNotionPageId(input.pageUrl);
  }
  const now = Date.now();
  const row = assertOk(
    await supabase()
      .from("actions")
      .insert({
        type,
        title: cleanTitle(input.title, type === "webhook" ? "Webhook" : "Notion"),
        config,
        on_transcript: bool(input.onTranscript, "onTranscript") ?? false,
        on_rewrite: bool(input.onRewrite, "onRewrite") ?? false,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single(),
  ) as ActionRow;
  return toAction(row);
}

export async function updateAction(id: number, patch: Record<string, unknown>): Promise<IntegrationAction> {
  const row = await getRow(id);
  const config = parseConfig(row.config);
  if (row.type === "webhook" && patch.url !== undefined) config.url = cleanUrl(patch.url);
  if (row.type === "notion") {
    if (typeof patch.token === "string" && patch.token.trim()) config.token = patch.token.trim();
    if (patch.pageUrl !== undefined) config.pageId = parseNotionPageId(patch.pageUrl);
  }
  const updated = assertOk(
    await supabase()
      .from("actions")
      .update({
        title: patch.title === undefined ? row.title : cleanTitle(patch.title, row.title),
        config,
        on_transcript: bool(patch.onTranscript, "onTranscript") ?? row.on_transcript,
        on_rewrite: bool(patch.onRewrite, "onRewrite") ?? row.on_rewrite,
        updated_at: Date.now(),
      })
      .eq("id", id)
      .select("*")
      .single(),
  ) as ActionRow;
  return toAction(updated);
}

export async function deleteAction(id: number): Promise<void> {
  const deleted = assertOk(await supabase().from("actions").delete().eq("id", id).select("id")) as Array<{ id: number }>;
  if (deleted.length === 0) throw notFound("Integration not found.");
}

export type ActionEvent = "note.transcribed" | "note.rewritten" | "manual" | "test";

export function buildPayload(event: ActionEvent, note: Note, rewrite: Rewrite | null) {
  const content = rewrite ? rewrite.text : note.transcript;
  return {
    event,
    text: `${note.title ? `${note.title}\n\n` : ""}${content}`,
    note: {
      id: note.id,
      title: note.title,
      transcript: note.transcript,
      language: note.language,
      source: note.source,
      durationSec: note.durationSec,
      tags: note.tags.map((tag) => tag.title),
      createdAt: new Date(note.createdAt).toISOString(),
      updatedAt: new Date(note.updatedAt).toISOString(),
    },
    rewrite: rewrite
      ? { id: rewrite.id, kind: rewrite.kind, label: rewrite.label, language: rewrite.language, text: rewrite.text }
      : null,
    sentAt: new Date().toISOString(),
  };
}

async function sendWebhook(url: string, payload: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Saydraft-Webhook/2.0" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(502, "webhook_unreachable", "Could not reach the webhook URL.");
  }
  if (!response.ok) {
    throw new HttpError(502, "webhook_failed", `The webhook answered with HTTP ${response.status}.`);
  }
}

function notionBase(): string {
  return (process.env.NOTION_API_URL?.trim() || "https://api.notion.com/v1").replace(/\/+$/, "");
}

function notionParagraphs(text: string) {
  const blocks: Array<Record<string, unknown>> = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    for (let start = 0; start < trimmed.length; start += 1900) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: trimmed.slice(start, start + 1900) } }] },
      });
    }
  }
  return blocks;
}

async function notionRequest(method: string, path: string, token: string, body: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${notionBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HttpError(502, "notion_unreachable", "Could not reach Notion.");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : `HTTP ${response.status}`;
    throw new HttpError(502, "notion_failed", `Notion rejected the request: ${message}`);
  }
  return data;
}

async function sendToNotion(config: ActionConfig, title: string, text: string): Promise<void> {
  if (!config.token || !config.pageId) throw badRequest("This Notion integration is missing its secret or page.");
  const blocks = notionParagraphs(text);
  const page = await notionRequest("POST", "/pages", config.token, {
    parent: { page_id: config.pageId },
    properties: { title: { title: [{ type: "text", text: { content: title.slice(0, 200) || "Saydraft note" } }] } },
    children: blocks.slice(0, 100),
  });
  const pageId = typeof page.id === "string" ? page.id : null;
  for (let start = 100; pageId && start < blocks.length; start += 100) {
    await notionRequest("PATCH", `/blocks/${pageId}/children`, config.token, { children: blocks.slice(start, start + 100) });
  }
}

async function recordResult(id: number, error: unknown): Promise<void> {
  await supabase()
    .from("actions")
    .update({
      last_status: error ? "error" : "ok",
      last_error: error ? (error instanceof Error ? error.message : "Failed").slice(0, 300) : null,
      last_run_at: Date.now(),
    })
    .eq("id", id);
}

async function execute(row: ActionRow, event: ActionEvent, note: Note, rewrite: Rewrite | null): Promise<void> {
  const config = parseConfig(row.config);
  try {
    if (row.type === "webhook") {
      if (!config.url) throw badRequest("This webhook has no URL.");
      await sendWebhook(config.url, buildPayload(event, note, rewrite));
    } else {
      const title = rewrite ? `${note.title || "Untitled note"} (${rewrite.label})` : note.title || "Untitled note";
      await sendToNotion(config, title, rewrite ? rewrite.text : note.transcript);
    }
    await recordResult(row.id, null);
  } catch (error) {
    await recordResult(row.id, error);
    throw error;
  }
}

/** Sends a note (or one of its rewrites) to an integration right away. */
export async function runAction(actionId: number, noteId: number, rewriteId: number | null): Promise<IntegrationAction> {
  const row = await getRow(actionId);
  const note = await getNote(noteId);
  if (!note) throw notFound("Note not found.");
  const rewrite = rewriteId ? await getRewrite(noteId, rewriteId) : null;
  if (rewriteId && !rewrite) throw notFound("Rewrite not found.");
  await execute(row, "manual", note, rewrite);
  return toAction(await getRow(actionId));
}

export async function testAction(actionId: number): Promise<IntegrationAction> {
  const row = await getRow(actionId);
  const now = Date.now();
  const sample: Note = {
    id: 0,
    title: "Test from Saydraft",
    transcript: "This is a test message. If you can read it, the integration works.",
    status: "ready",
    stage: null,
    progress: null,
    error: null,
    source: "text",
    language: "en",
    speakers: false,
    archived: false,
    durationSec: null,
    tags: [],
    audioFiles: [],
    rewrites: [],
    createdAt: now,
    updatedAt: now,
  };
  await execute(row, "test", sample, null);
  return toAction(await getRow(actionId));
}

/** Fires integrations that subscribe to an event. Errors are recorded, never thrown. */
export async function triggerAutomaticActions(kind: "transcript" | "rewrite", noteId: number, rewriteId: number | null): Promise<void> {
  const column = kind === "transcript" ? "on_transcript" : "on_rewrite";
  const rows = assertOk(await supabase().from("actions").select("*").eq(column, true)) as ActionRow[];
  if (rows.length === 0) return;
  const note = await getNote(noteId);
  if (!note) return;
  const rewrite = rewriteId ? await getRewrite(noteId, rewriteId) : null;
  const event: ActionEvent = kind === "transcript" ? "note.transcribed" : "note.rewritten";
  await Promise.all(rows.map((row) => execute(row, event, note, rewrite).catch((error) => {
      console.warn(`Integration "${row.title}" failed:`, error instanceof Error ? error.message : error);
  })));
}
