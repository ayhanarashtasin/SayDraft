import { json, parseId } from "@/server/http";
import { testAction } from "@/server/integrations";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a sample message so the user can check the integration works. */
export const POST = route<{ id: string }>(async (_request, params, user) => {
  return json({ action: await testAction(user.id, parseId(params.id, "integration id")) });
});
