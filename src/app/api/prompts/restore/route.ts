import { json, route } from "@/server/http";
import { listPrompts, restoreDefaultPrompts } from "@/server/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-adds any built-in prompt the user deleted. */
export const POST = route(async () => {
  const added = await restoreDefaultPrompts();
  return json({ added, prompts: await listPrompts() });
});
