import fs from "node:fs";
import { Readable } from "node:stream";
import { HttpError } from "./http.ts";

export interface FileResponseOptions {
  mime: string;
  /** Validator for conditional requests; changes whenever the stored file changes. */
  etag?: string;
  /** Sends Content-Disposition: attachment with this file name. */
  downloadName?: string;
  /** Removes temporary export files after the response closes. */
  cleanup?: () => void;
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Parses a single "bytes=" range, including suffix ranges ("bytes=-500"). */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

/** Streams a file with Range (seeking) and ETag support. */
export function fileResponse(request: Request, filePath: string, options: FileResponseOptions): Response {
  let size: number;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    throw new HttpError(404, "not_found", "The audio file is missing.");
  }
  const etag = options.etag ? `"${options.etag}"` : undefined;
  const headers = new Headers({
    "Content-Type": options.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
  });
  if (etag) headers.set("ETag", etag);
  if (options.downloadName) headers.set("Content-Disposition", contentDisposition(options.downloadName));

  if (etag && request.headers.get("if-none-match") === etag && !options.cleanup) {
    return new Response(null, { status: 304, headers });
  }

  const cleanup = () => options.cleanup?.();

  const rangeHeader = request.headers.get("range");
  if (rangeHeader && !options.cleanup) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  if (request.method === "HEAD") {
    cleanup();
    return new Response(null, { status: 200, headers });
  }
  const stream = fs.createReadStream(filePath);
  stream.once("close", cleanup);
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers });
}
