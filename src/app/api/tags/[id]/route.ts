import { json, parseId, readJson, route } from "@/server/http";
import { deleteTag, updateTag } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params) => {
  const body = await readJson(request);
  return json({ tag: await updateTag(parseId(params.id, "tag id"), body) });
});

export const DELETE = route<{ id: string }>(async (_request, params) => {
  await deleteTag(parseId(params.id, "tag id"));
  return json({ ok: true });
});
