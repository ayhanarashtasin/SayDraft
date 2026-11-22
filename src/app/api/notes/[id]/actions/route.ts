import { json, parseId, readJson, route } from "@/server/http";
import { runAction } from "@/server/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the note (or one of its versions) to a webhook or Notion: { actionId, rewriteId? } */
export const POST = route<{ id: string }>(async (request, params) => {
  const noteId = parseId(params.id, "note id");
  const body = await readJson(request);
  const actionId = parseId(String(body.actionId), "integration");
  const rewriteId = body.rewriteId === undefined || body.rewriteId === null ? null : parseId(String(body.rewriteId), "version id");
  const action = await runAction(actionId, noteId, rewriteId);
  return json({ action });
});
