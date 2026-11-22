import { json, readJson, route } from "@/server/http";
import { createAction, listActions } from "@/server/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ actions: await listActions() }));

/** { type: "webhook", url } or { type: "notion", token, pageUrl }, plus title, onTranscript, onRewrite. */
export const POST = route(async (request) => {
  const body = await readJson(request);
  return json({ action: await createAction(body) }, { status: 201 });
});
