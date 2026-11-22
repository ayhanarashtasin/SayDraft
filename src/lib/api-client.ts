"use client";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const NETWORK_MESSAGE = "Could not reach Saydraft. Check your connection and try again.";

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const message = body?.error?.message || `Request failed (HTTP ${response.status}).`;
  return new ApiError(response.status, body?.error?.code || "http_error", message);
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
  signal?: AbortSignal;
}

/** Fetches a JSON API route and throws ApiError with the server's message on failure. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = options.json === undefined ? "GET" : "POST", json, signal } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      cache: "no-store",
      headers: json === undefined ? undefined : { "Content-Type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network", NETWORK_MESSAGE);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export interface StreamEvent<T> {
  type: "start" | "delta" | "done" | "error";
  text?: string;
  rewrite?: T;
  error?: { code: string; message: string };
}

/** Reads a newline-delimited JSON stream (used for streaming rewrites). */
export async function readNdjson<T>(
  response: Response,
  onEvent: (event: StreamEvent<T>) => void,
): Promise<void> {
  if (!response.body) throw new ApiError(response.status, "no_body", "The server returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent<T>);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as StreamEvent<T>);
}

export async function postStream<T>(
  path: string,
  json: unknown,
  onEvent: (event: StreamEvent<T>) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network", NETWORK_MESSAGE);
  }
  if (!response.ok) throw await toApiError(response);
  await readNdjson(response, onEvent);
}
