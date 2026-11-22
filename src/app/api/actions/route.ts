import { json, readJson } from "@/server/http";
import { createAction, listActions } from "@/server/integrations";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json({ actions: await listActions(user.id) }));

/** { type: "webhook", url } or { type: "notion", token, pageUrl }, plus title, onTranscript, onRewrite. */
export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  return json({ action: await createAction(user.id, body) }, { status: 201 });
});
