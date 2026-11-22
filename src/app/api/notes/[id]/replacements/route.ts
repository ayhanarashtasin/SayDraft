import { applyReplacements } from "@/lib/text";
import { badRequest, json, notFound, parseId, readJson, route } from "@/server/http";
import { getNote, getRewrite, updateNote, updateRewrite } from "@/server/notes";
import { listReplacements } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params) => {
  const noteId = parseId(params.id, "note id");
  const body = await readJson(request);
  const note = await getNote(noteId);
  if (!note) throw notFound("Note not found.");
  const rules = (await listReplacements()).filter((rule) => rule.isActive);
  if (rules.length === 0) throw badRequest("You have no active text replacements. Add some in Settings → Text replacements.");

  if (body.rewriteId !== undefined && body.rewriteId !== null) {
    const rewrite = await getRewrite(noteId, parseId(String(body.rewriteId), "version id"));
    if (!rewrite) throw notFound("That version no longer exists.");
    const result = applyReplacements(rewrite.text, rules);
    if (result.count > 0) await updateRewrite(rewrite.id, { text: result.text });
    return json({ count: result.count, note: await getNote(noteId) });
  }

  const result = applyReplacements(note.transcript, rules);
  const updated = result.count > 0 ? await updateNote(noteId, { transcript: result.text }) : note;
  return json({ count: result.count, note: updated });
});
