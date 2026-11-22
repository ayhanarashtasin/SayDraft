import { NOTE_TEXT_MAX } from "@/lib/limits";
import { conflict, json, notFound, parseId, readJson, requireString, route } from "@/server/http";
import { deleteRewrite, getRewrite, updateRewrite } from "@/server/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string; rewriteId: string };

export const PATCH = route<Params>(async (request, params) => {
  const noteId = parseId(params.id, "note id");
  const rewriteId = parseId(params.rewriteId, "version id");
  const existing = await getRewrite(noteId, rewriteId);
  if (!existing) throw notFound("That version no longer exists.");
  if (existing.status === "processing") throw conflict("Wait for this version to finish before editing it.");
  const body = await readJson(request, NOTE_TEXT_MAX * 4 + 10_000);
  const text = requireString(body.text, "Text", NOTE_TEXT_MAX);
  return json({ rewrite: await updateRewrite(rewriteId, { text }) });
});

export const DELETE = route<Params>(async (_request, params) => {
  const noteId = parseId(params.id, "note id");
  if (!(await deleteRewrite(noteId, parseId(params.rewriteId, "version id")))) {
    throw notFound("That version no longer exists.");
  }
  return json({ ok: true });
});
