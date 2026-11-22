import { json } from "@/server/http";
import { listPrompts, restoreDefaultPrompts } from "@/server/prompts";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-adds any built-in prompt the user deleted. */
export const POST = route(async (_request, _params, user) => {
  const added = await restoreDefaultPrompts(user.id);
  return json({ added, prompts: await listPrompts(user.id) });
});
