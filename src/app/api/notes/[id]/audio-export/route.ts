import fs from "node:fs";
import path from "node:path";
import { slugify } from "@/lib/format";
import { concatToM4a, hasFfmpeg } from "@/server/audio";
import { contentDisposition, fileResponse } from "@/server/files";
import { HttpError, notFound, parseId } from "@/server/http";
import { getNoteRow, listAudioRows } from "@/server/notes";
import { route } from "@/server/route";
import { createAudioSignedUrl, streamAudioObject, tempDir } from "@/server/supabase";
import { zipStream } from "@/server/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = route<{ id: string }>(async (request, params, user) => {
  const noteId = parseId(params.id, "note id");
  const note = await getNoteRow(user.id, noteId);
  if (!note) throw notFound("Note not found.");
  const files = await listAudioRows(user.id, noteId);
  if (files.length === 0) throw notFound("This note has no audio.");
  const base = slugify(note.title || "recording");

  if (files.length === 1) {
    const [file] = files;
    const signedUrl = await createAudioSignedUrl(file.file_name, 300);
    if (!signedUrl) throw new HttpError(404, "not_found", "The audio file is missing.");
    const upstream = await fetch(signedUrl, { cache: "no-store", signal: request.signal });
    if (!upstream.ok) throw new HttpError(404, "not_found", "The audio file is missing.");
    const headers = new Headers({
      "Content-Type": file.mime,
      "Content-Disposition": contentDisposition(`${base}${path.extname(file.file_name)}`),
      "Cache-Control": "private, no-cache",
    });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    return new Response(upstream.body, { status: 200, headers });
  }

  if (hasFfmpeg()) {
    const workDir = fs.mkdtempSync(path.join(tempDir(), "export-"));
    const output = path.join(workDir, "joined.m4a");
    try {
      const inputs = await Promise.all(files.map((file) => createAudioSignedUrl(file.file_name)));
      if (inputs.some((input) => !input)) throw notFound("An audio file is missing.");
      await concatToM4a(inputs as string[], output, AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]));
      return fileResponse(request, output, {
        mime: "audio/mp4", downloadName: `${base}.m4a`, cleanup: () => fs.rm(workDir, { recursive: true, force: true }, () => {}),
      });
    } catch (error) {
      fs.rmSync(workDir, { recursive: true, force: true });
      if (error instanceof HttpError) throw error;
      request.signal.throwIfAborted();
      console.warn("Returning separate audio files because joining failed:", error instanceof Error ? error.message : error);
    }
  }

  const entries = files.map((file) => ({
    name: `${base}-${file.position + 1}${path.extname(file.file_name)}`,
    open: () => streamAudioObject(file.file_name, request.signal),
  }));
  return new Response(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${base}-audio.zip`),
      "Cache-Control": "no-store",
    },
  });
});
