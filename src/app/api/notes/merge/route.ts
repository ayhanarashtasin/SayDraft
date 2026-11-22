import { TITLE_MAX } from "@/lib/limits";
import { badRequest, idList, json, optionalBoolean, optionalString, readJson } from "@/server/http";
import { mergeNotes } from "@/server/notes";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  const ids = idList(body.ids, "ids", 200);
  if (ids.length < 2) throw badRequest("Select at least two notes to merge.");
  const note = await mergeNotes(user.id, ids, {
    title: optionalString(body.title, "Title", TITLE_MAX),
    archiveOriginals: optionalBoolean(body.archiveOriginals, "archiveOriginals") ?? false,
  });
  return json({ note }, { status: 201 });
});
