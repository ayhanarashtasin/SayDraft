import { TITLE_MAX } from "@/lib/limits";
import { badRequest, idList, json, optionalBoolean, optionalString, readJson, route } from "@/server/http";
import { mergeNotes } from "@/server/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const ids = idList(body.ids, "ids", 200);
  if (ids.length < 2) throw badRequest("Select at least two notes to merge.");
  const note = await mergeNotes(ids, {
    title: optionalString(body.title, "Title", TITLE_MAX),
    archiveOriginals: optionalBoolean(body.archiveOriginals, "archiveOriginals") ?? false,
  });
  return json({ note }, { status: 201 });
});
