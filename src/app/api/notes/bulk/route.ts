import { badRequest, idList, json, parseId, readJson } from "@/server/http";
import { archiveNotes, deleteNotes, tagNotes } from "@/server/notes";
import { route } from "@/server/route";
import { tagExists } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  const ids = idList(body.ids, "ids");
  if (ids.length === 0) throw badRequest("Select at least one note.");
  switch (body.action) {
    case "archive":
    case "unarchive":
      return json({ changed: await archiveNotes(user.id, ids, body.action === "archive") });
    case "delete":
      return json({ changed: await deleteNotes(user.id, ids) });
    case "tag":
    case "untag": {
      const tagId = parseId(String(body.tagId), "tag");
      if (!(await tagExists(user.id, tagId))) throw badRequest("That tag no longer exists.");
      return json({ changed: await tagNotes(user.id, ids, tagId, body.action === "tag") });
    }
    default:
      throw badRequest("Unknown bulk action.");
  }
});
