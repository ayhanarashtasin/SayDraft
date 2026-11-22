import { badRequest, idList, json, parseId, readJson, route } from "@/server/http";
import { archiveNotes, deleteNotes, tagNotes } from "@/server/notes";
import { tagExists } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const ids = idList(body.ids, "ids");
  if (ids.length === 0) throw badRequest("Select at least one note.");
  switch (body.action) {
    case "archive":
    case "unarchive":
      return json({ changed: await archiveNotes(ids, body.action === "archive") });
    case "delete":
      return json({ changed: await deleteNotes(ids) });
    case "tag":
    case "untag": {
      const tagId = parseId(String(body.tagId), "tag");
      if (!(await tagExists(tagId))) throw badRequest("That tag no longer exists.");
      return json({ changed: await tagNotes(ids, tagId, body.action === "tag") });
    }
    default:
      throw badRequest("Unknown bulk action.");
  }
});
