import { json, readJson, route } from "@/server/http";
import { createTag, listTags } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ tags: await listTags() }));

export const POST = route(async (request) => {
  const body = await readJson(request);
  return json({ tag: await createTag(body.title, body.color) }, { status: 201 });
});
