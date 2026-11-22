import path from "node:path";
import { slugify } from "@/lib/format";
import { contentDisposition } from "@/server/files";
import { HttpError, json, notFound, parseId } from "@/server/http";
import { deleteAudioFile, getAudioRow, getNoteRow } from "@/server/notes";
import { route } from "@/server/route";
import { createAudioSignedUrl } from "@/server/supabase";
import { finishAudioUpload } from "@/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { id: string; fileId: string };

async function load(userId: string, params: Params) {
  const noteId = parseId(params.id, "note id");
  const fileId = parseId(params.fileId, "audio id");
  const row = await getAudioRow(userId, noteId, fileId);
  if (!row) throw notFound("Audio not found.");
  return { noteId, row };
}

export const GET = route<Params>(async (request, params, user) => {
  const { noteId, row } = await load(user.id, params);
  const download = request.nextUrl.searchParams.get("download") === "1";
  const etag = `"${row.file_name}"`;

  const headers = new Headers({
    "Content-Type": row.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    ETag: etag,
  });
  if (download) {
    const title = (await getNoteRow(user.id, noteId))?.title || "note";
    headers.set("Content-Disposition", contentDisposition(`${slugify(title)}-${row.position + 1}${path.extname(row.file_name)}`));
  }
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const signedUrl = await createAudioSignedUrl(row.file_name, 300);
  if (!signedUrl) throw new HttpError(404, "not_found", "The audio file is missing.");

  const range = request.headers.get("range");
  const upstream = await fetch(signedUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
    signal: request.signal,
  });

  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (upstream.status === 416) {
    await upstream.body?.cancel();
    headers.set("Content-Range", contentRange ?? `bytes */${row.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    throw new HttpError(404, "not_found", "The audio file is missing.");
  }
  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentRange) headers.set("Content-Range", contentRange);

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
});

export const HEAD = GET;

export const POST = route<Params>(async (_request, params, user) => {
  const audioFile = await finishAudioUpload(user.id, parseId(params.id, "note id"), parseId(params.fileId, "audio id"));
  return json({ audioFile });
});

export const DELETE = route<Params>(async (_request, params, user) => {
  if (!(await deleteAudioFile(user.id, parseId(params.id, "note id"), parseId(params.fileId, "audio id")))) throw notFound("Audio not found.");
  return json({ ok: true });
});
