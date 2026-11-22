import { json, parseId, route } from "@/server/http";
import { testAction } from "@/server/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a sample message so the user can check the integration works. */
export const POST = route<{ id: string }>(async (_request, params) => {
  return json({ action: await testAction(parseId(params.id, "integration id")) });
});
