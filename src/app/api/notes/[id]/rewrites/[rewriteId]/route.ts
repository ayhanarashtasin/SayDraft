import { NOTE_TEXT_MAX } from "@/lib/limits";
import { conflict, json, notFound, parseId, readJson, requireString } from "@/server/http";
import { deleteRewrite, getRewrite, updateRewrite } from "@/server/notes";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string; rewriteId: string };

export const PATCH = route<Params>(async (request, params, user) => {
  const noteId = parseId(params.id, "note id");
  const rewriteId = parseId(params.rewriteId, "version id");
  const existing = await getRewrite(user.id, noteId, rewriteId);
  if (!existing) throw notFound("That version no longer exists.");
  if (existing.status === "processing") throw conflict("Wait for this version to finish before editing it.");
  const body = await readJson(request, NOTE_TEXT_MAX * 4 + 10_000);
  const text = requireString(body.text, "Text", NOTE_TEXT_MAX);
  return json({ rewrite: await updateRewrite(user.id, rewriteId, { text }) });
});

export const DELETE = route<Params>(async (_request, params, user) => {
  const noteId = parseId(params.id, "note id");
  if (!(await deleteRewrite(user.id, noteId, parseId(params.rewriteId, "version id")))) {
    throw notFound("That version no longer exists.");
  }
  return json({ ok: true });
});
