import { idList, json, readJson, route } from "@/server/http";
import { reorderTags } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const body = await readJson(request);
  return json({ tags: await reorderTags(idList(body.ids, "ids", 500)) });
});
