import fs from "node:fs";
import { HttpError } from "./http.ts";

export function aiConfig(): { apiKey: string; baseUrl: string; configured: boolean } {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  return { apiKey, baseUrl, configured: Boolean(apiKey) };
}

function requireKey(): { apiKey: string; baseUrl: string } {
  const { apiKey, baseUrl } = aiConfig();
  if (!apiKey) {
    throw new HttpError(503, "key_missing", "Set OPENAI_API_KEY in the server environment to use AI features.");
  }
  return { apiKey, baseUrl };
}

function upstreamMessage(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? message.replace(/(sk-|gsk_)[A-Za-z0-9_-]{6,}/g, "$1…").slice(0, 300) : "";
}

function mapError(status: number, body: unknown, kind: "audio" | "text"): HttpError {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  const detail = upstreamMessage(body);
  if (status === 401 || status === 403) {
    return new HttpError(502, "provider_auth", "OpenAI rejected the API key. Check OPENAI_API_KEY and your API billing.");
  }
  if (status === 404) {
    return new HttpError(502, "provider_model", `The AI model was not found or your key can't use it. Check the models in Settings → Preferences.${detail ? ` (${detail})` : ""}`);
  }
  if (status === 429 && code === "insufficient_quota") {
    return new HttpError(429, "provider_quota", "Your OpenAI API quota is used up. Check your API billing and limits.");
  }
  if (status === 429) return new HttpError(429, "provider_rate_limit", "OpenAI is rate limiting requests. Wait a moment and retry.");
  if (status === 413) return new HttpError(413, "provider_too_large", "The audio piece was too large for the transcription API.");
  if (status >= 400 && status < 500) {
    const prefix = kind === "audio" ? "The transcription service could not process this audio" : "The AI request was rejected";
    return new HttpError(422, "provider_rejected", `${prefix}${detail ? `: ${detail}` : "."}`);
  }
  return new HttpError(502, "provider_error", `OpenAI returned an error (HTTP ${status}). Try again.`);
}

function isRetryable(status: number, body: unknown): boolean {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (status === 429) return code !== "insufficient_quota";
  return status === 408 || status === 409 || status >= 500;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

interface RequestOptions {
  kind: "audio" | "text";
  timeoutMs: number;
  retries: number;
  signal?: AbortSignal;
}

/** POSTs to the API with retries for rate limits, server errors and network failures. */
async function post(path: string, makeBody: () => BodyInit, headers: Record<string, string>, options: RequestOptions): Promise<Response> {
  const { apiKey, baseUrl } = requireKey();
  let attempt = 0;
  for (;;) {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, ...headers },
        body: makeBody(),
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason ?? error;
      if (attempt < options.retries) {
        attempt += 1;
        await sleep(1500 * 2 ** attempt, options.signal);
        continue;
      }
      if (timeout.aborted) throw new HttpError(504, "provider_timeout", "OpenAI took too long to respond. Try again.");
      throw new HttpError(502, "provider_unreachable", "Could not reach OpenAI. Check your internet connection and try again.");
    }
    if (response.ok) return response;
    const body = await response.json().catch(() => null);
    if (attempt < options.retries && isRetryable(response.status, body)) {
      attempt += 1;
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1500 * 2 ** attempt, options.signal);
      continue;
    }
    throw mapError(response.status, body, options.kind);
  }
}

export interface TranscribeInput {
  filePath: string;
  fileName: string;
  mime: string;
  model: string;
  language?: string;
  prompt?: string;
  diarize?: boolean;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  segments?: Array<{ speaker: string; text: string }>;
}

export async function transcribe(input: TranscribeInput): Promise<TranscribeResult> {
  const blob = await fs.openAsBlob(input.filePath, { type: input.mime });
  const response = await post(
    "audio/transcriptions",
    () => {
      const form = new FormData();
      form.set("file", blob, input.fileName);
      form.set("model", input.model);
      if (input.language) form.set("language", input.language);
      if (input.diarize) {
        form.set("response_format", "diarized_json");
        form.set("chunking_strategy", "auto");
      } else {
        form.set("response_format", "json");
        if (input.prompt) form.set("prompt", input.prompt);
      }
      return form;
    },
    {},
    { kind: "audio", timeoutMs: 15 * 60_000, retries: 2, signal: input.signal },
  );
  const data = (await response.json().catch(() => null)) as {
    text?: unknown;
    segments?: Array<{ speaker?: unknown; text?: unknown }>;
  } | null;
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  const segments = Array.isArray(data?.segments)
    ? data.segments
        .filter((segment) => typeof segment?.text === "string")
        .map((segment) => ({ speaker: typeof segment.speaker === "string" ? segment.speaker : "?", text: String(segment.text) }))
    : undefined;
  return { text, segments: segments && segments.length ? segments : undefined };
}

export interface ChatInput {
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}

function chatBody(input: ChatInput, stream: boolean): string {
  return JSON.stringify({
    model: input.model,
    stream,
    ...(/gpt-oss/i.test(input.model) ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  });
}

export async function chat(input: ChatInput): Promise<string> {
  const response = await post("chat/completions", () => chatBody(input, false), { "Content-Type": "application/json" }, {
    kind: "text",
    timeoutMs: 5 * 60_000,
    retries: 2,
    signal: input.signal,
  });
  const data = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

export interface StreamResult {
  text: string;
  truncated: boolean;
}

/** Streams a chat completion, calling onDelta for each piece of text. */
export async function chatStream(input: ChatInput, onDelta: (text: string) => void): Promise<StreamResult> {
  const idle = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, idle.signal]) : idle.signal;
  const response = await post("chat/completions", () => chatBody(input, true), { "Content-Type": "application/json" }, {
    kind: "text",
    timeoutMs: 20 * 60_000,
    retries: 1,
    signal,
  });
  if (!response.body) throw new HttpError(502, "provider_error", "OpenAI returned an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let truncated = false;
  let idleTimer = setTimeout(() => idle.abort(), 120_000);

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: { error?: { message?: string }; choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }> };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (event.error) throw new HttpError(502, "provider_error", event.error.message || "The AI stream failed.");
    const choice = event.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta) {
      text += delta;
      onDelta(delta);
    }
    if (choice?.finish_reason === "length") truncated = true;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => idle.abort(), 120_000);
      if (value) buffer += decoder.decode(value, { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (done) break;
    }
    if (buffer.trim()) handleLine(buffer.trim());
  } catch (error) {
    if (idle.signal.aborted && !input.signal?.aborted) {
      throw new HttpError(504, "provider_timeout", "The AI stopped responding. Try again.");
    }
    throw error;
  } finally {
    clearTimeout(idleTimer);
  }
  return { text: text.trim(), truncated };
}
