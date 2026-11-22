import { idList, json, readJson } from "@/server/http";
import { route } from "@/server/route";
import { reorderTags } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  return json({ tags: await reorderTags(user.id, idList(body.ids, "ids", 500)) });
});
