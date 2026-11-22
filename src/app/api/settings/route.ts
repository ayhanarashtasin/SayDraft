import { json, readJson, route } from "@/server/http";
import { promptExists } from "@/server/prompts";
import { getSettings, updateSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ settings: await getSettings() }));

export const PATCH = route(async (request) => {
  const body = await readJson(request);
  return json({ settings: await updateSettings(body, promptExists) });
});
