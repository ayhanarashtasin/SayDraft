import { json, readJson } from "@/server/http";
import { route } from "@/server/route";
import { createTag, listTags } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json({ tags: await listTags(user.id) }));

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  return json({ tag: await createTag(user.id, body.title, body.color) }, { status: 201 });
});
