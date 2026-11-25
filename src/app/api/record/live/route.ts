import type { NextRequest } from "next/server";
import { isLanguageCode } from "@/lib/languages";
import { LIVE_PREVIEW_MAX_BYTES, audioExtension, baseMime } from "@/lib/limits";
import { type PendingAuth, applyPending, readClaims } from "@/server/auth";
import { HttpError, badRequest, errorResponse, guardRequest, json } from "@/server/http";
import { transcribe } from "@/server/openai";
import { getPreviewSettings } from "@/server/settings";

export const runtime = "nodejs";
export const maxDuration = 15;

const ACCEPTED_TYPES = new Set([
  "audio/webm", "video/webm",
  "audio/mp4", "video/mp4", "audio/x-m4a", "audio/m4a",
  "audio/ogg", "audio/opus", "application/ogg",
]);
const PREVIEW_COOLDOWN_MS = 450;
const nextRequest = new Map<string, number>();

function checkPreviewCooldown(userId: string) {
  const now = Date.now();
  // ponytail: per-instance guard against rapid repeats; the provider enforces the shared quota.
  for (const [id, expires] of nextRequest) {
    if (expires <= now) nextRequest.delete(id);
  }
  if (nextRequest.has(userId)) throw new HttpError(429, "live_rate_limit", "Too many live preview requests. Try again shortly.");
}

function recordPreviewCooldown(userId: string) {
  nextRequest.set(userId, Date.now() + PREVIEW_COOLDOWN_MS);
}

async function readClip(request: Request, mime: string) {
  const tooLarge = () => new HttpError(413, "too_large", "The live audio clip is too large.");
  if (Number(request.headers.get("content-length")) > LIVE_PREVIEW_MAX_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw badRequest("No preview audio was received.", "no_audio");
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIVE_PREVIEW_MAX_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw badRequest("No preview audio was received.", "no_audio");
  return new Blob(parts, { type: mime });
}

export async function POST(request: NextRequest): Promise<Response> {
  let pending: PendingAuth | undefined;
  try {
    guardRequest(request);
    // ponytail: verify the signed session JWT locally to skip a Supabase Auth round trip per preview clip;
    // this route neither reads nor writes user data, and sign-out clears the session cookie immediately.
    const auth = await readClaims(request);
    pending = auth.pending;
    if (!auth.user) return applyPending(errorResponse(new HttpError(401, "unauthenticated", "Sign in to continue.")), pending);

    const rawMime = baseMime(request.headers.get("content-type"));
    if (!ACCEPTED_TYPES.has(rawMime)) throw new HttpError(415, "unsupported_type", "This audio format isn’t supported for live preview.");
    const language = request.nextUrl.searchParams.get("language") || "auto";
    if (language !== "auto" && !isLanguageCode(language)) throw badRequest("Unknown speaker language.");

    checkPreviewCooldown(auth.user.id);
    const mime = rawMime.startsWith("video/") ? `audio/${rawMime.slice(6)}` : rawMime;
    const clip = await readClip(request, mime);
    recordPreviewCooldown(auth.user.id);

    const settings = await getPreviewSettings(auth.user.id);
    const effectiveLanguage = language === "auto" ? settings.defaultLanguage : language;
    const { text } = await transcribe({
      blob: clip,
      fileName: `preview.${audioExtension(mime)}`,
      mime,
      model: settings.transcribeModel,
      language: effectiveLanguage === "auto" ? undefined : effectiveLanguage,
      signal: request.signal,
      preview: true,
    });
    return applyPending(json({ text }), pending);
  } catch (error) {
    if (request.signal.aborted) {
      const response = new Response(null, { status: 499, headers: { "Cache-Control": "no-store" } });
      return pending ? applyPending(response, pending) : response;
    }
    return pending ? applyPending(errorResponse(error), pending) : errorResponse(error);
  }
}
