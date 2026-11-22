import { NOTE_TEXT_MAX, TITLE_MAX } from "@/lib/limits";
import { idList, json, notFound, optionalBoolean, optionalString, parseId, readJson } from "@/server/http";
import { deleteNotes, requireNote, updateNote } from "@/server/notes";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_request, params, user) => {
  return json({ note: await requireNote(user.id, parseId(params.id, "note id")) });
});

export const PATCH = route<{ id: string }>(async (request, params, user) => {
  const id = parseId(params.id, "note id");
  const body = await readJson(request, NOTE_TEXT_MAX * 4 + 10_000);
  const note = await updateNote(user.id, id, {
    title: optionalString(body.title, "Title", TITLE_MAX),
    transcript: optionalString(body.transcript, "Note text", NOTE_TEXT_MAX),
    archived: optionalBoolean(body.archived, "archived"),
    tagIds: body.tagIds === undefined ? undefined : idList(body.tagIds, "tagIds", 100),
  });
  if (!note) throw notFound("Note not found.");
  return json({ note });
});

export const DELETE = route<{ id: string }>(async (_request, params, user) => {
  const id = parseId(params.id, "note id");
  if ((await deleteNotes(user.id, [id])) === 0) throw notFound("Note not found.");
  return json({ ok: true });
});
