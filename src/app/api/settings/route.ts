import { json, readJson } from "@/server/http";
import { promptExists } from "@/server/prompts";
import { route } from "@/server/route";
import { getSettings, updateSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json({ settings: await getSettings(user.id) }));

export const PATCH = route(async (request, _params, user) => {
  const body = await readJson(request);
  return json({ settings: await updateSettings(user.id, body, (id) => promptExists(user.id, id)) });
});
