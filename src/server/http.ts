import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "bad_request") => new HttpError(400, code, message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);

const LOCAL_HOST_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostName(host: string): string {
  const lower = host.toLowerCase();
  if (lower.startsWith("[")) return lower.slice(0, lower.indexOf("]") + 1);
  return lower.split(":")[0];
}

export function isAllowedHost(host: string | null): boolean {
  if (!host) return false;
  const name = hostName(host);
  if (LOCAL_HOST_NAMES.has(name) && !process.env.VERCEL) return true;
  const extra = [
    ...(process.env.ALLOWED_HOSTS || "").split(","),
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].map((item) => item?.trim().toLowerCase()).filter(Boolean);
  return extra.includes(name) || extra.includes(host.toLowerCase());
}

export function guardAccess(request: Request): void {
  const host = request.headers.get("host");
  if (!host || !isAllowedHost(host)) {
    throw new HttpError(403, "host_not_allowed", "This domain is not configured for Saydraft.");
  }
  const password = process.env.SAYDRAFT_PASSWORD?.trim();
  const hosted = Boolean(process.env.VERCEL) || !LOCAL_HOST_NAMES.has(hostName(host));
  if (!password && !hosted) return;
  if (!password || password.length < 32) {
    throw new HttpError(503, "workspace_password_missing", "Set a workspace password of at least 32 characters on the server.");
  }
  const expected = `Basic ${Buffer.from(`saydraft:${password}`).toString("base64")}`;
  const received = (request.headers.get("authorization") ?? "").replace(/^basic /i, "Basic ");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(received), digest(expected))) {
    throw new HttpError(401, "workspace_login", "Sign in with the Saydraft workspace password.");
  }
}

/**
 * Blocks DNS-rebinding (unexpected Host header) and cross-site requests (CSRF),
 * so other websites open in the browser cannot read notes or spend API credits.
 */
export function guardRequest(request: Request): void {
  const host = request.headers.get("host");
  guardAccess(request);
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new HttpError(403, "cross_site", "Requests from other websites are not allowed.");
  }
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (origin === null) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // "null" or malformed origins are rejected below.
  }
  if (!originHost || originHost !== host!.toLowerCase()) {
    throw new HttpError(403, "cross_origin", "Requests from other websites are not allowed.");
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const body = JSON.stringify(data);
  // Large notes can have several full rewrites. Stream large JSON responses on Vercel.
  if (body?.length > 1_000_000 && Buffer.byteLength(body) > 4_000_000) {
    const bytes = new TextEncoder().encode(body);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const end = Math.min(offset + 64 * 1024, bytes.length);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
        if (offset === bytes.length) controller.close();
      },
    });
    return new Response(stream, { ...init, headers });
  }
  return new Response(body, { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    const headers = new Headers(NO_STORE);
    if (error.code === "workspace_login") headers.set("WWW-Authenticate", 'Basic realm="Saydraft", charset="UTF-8"');
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
  }
  console.error("Saydraft API error:", error);
  return Response.json(
    { error: { code: "internal", message: "Something went wrong on the server. Try again." } },
    { status: 500, headers: NO_STORE },
  );
}

type RouteContext<P> = { params: Promise<P> };

/** Wraps a route handler with the request guard and uniform JSON errors. */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (request: NextRequest, params: P) => Promise<Response> | Response,
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      guardRequest(request);
      const params = context?.params ? await context.params : ({} as P);
      return await handler(request, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Reads a JSON object body with a size cap. */
export async function readJson(request: Request, maxBytes = 2_000_000): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "json_required", "Send the request body as JSON.");
  }
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) throw new HttpError(413, "too_large", "The request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "The request is too large.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw badRequest("The request body is not valid JSON.", "invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("The request body must be a JSON object.", "invalid_json");
  }
  return value as Record<string, unknown>;
}

export function parseId(raw: string | null | undefined, what = "id"): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest(`Invalid ${what}.`, "invalid_id");
  return id;
}

export function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  if (value.length > max) throw new HttpError(413, "too_large", `${field} is too long (max ${max.toLocaleString("en-US")} characters).`);
  return value;
}

export function requireString(value: unknown, field: string, max: number): string {
  const text = optionalString(value, field, max)?.trim();
  if (!text) throw badRequest(`${field} is required.`);
  return text;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`${field} must be true or false.`);
  return value;
}

export function idList(value: unknown, field = "ids", max = 1000): number[] {
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list.`);
  const ids = [...new Set(value.map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length > max) throw badRequest(`Too many ${field} (max ${max}).`);
  return ids;
}
