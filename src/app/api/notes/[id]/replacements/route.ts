import { applyReplacements } from "@/lib/text";
import { badRequest, json, notFound, parseId, readJson } from "@/server/http";
import { getNote, getRewrite, updateNote, updateRewrite } from "@/server/notes";
import { route } from "@/server/route";
import { listReplacements } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params, user) => {
  const noteId = parseId(params.id, "note id");
  const body = await readJson(request);
  const note = await getNote(user.id, noteId);
  if (!note) throw notFound("Note not found.");
  const rules = (await listReplacements(user.id)).filter((rule) => rule.isActive);
  if (rules.length === 0) throw badRequest("You have no active text replacements. Add some in Settings → Text replacements.");

  if (body.rewriteId !== undefined && body.rewriteId !== null) {
    const rewrite = await getRewrite(user.id, noteId, parseId(String(body.rewriteId), "version id"));
    if (!rewrite) throw notFound("That version no longer exists.");
    const result = applyReplacements(rewrite.text, rules);
    if (result.count > 0) await updateRewrite(user.id, rewrite.id, { text: result.text });
    return json({ count: result.count, note: await getNote(user.id, noteId) });
  }

  const result = applyReplacements(note.transcript, rules);
  const updated = result.count > 0 ? await updateNote(user.id, noteId, { transcript: result.text }) : note;
  return json({ count: result.count, note: updated });
});
