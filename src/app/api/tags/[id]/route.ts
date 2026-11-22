import { json, parseId, readJson } from "@/server/http";
import { route } from "@/server/route";
import { deleteTag, updateTag } from "@/server/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params, user) => {
  const body = await readJson(request);
  return json({ tag: await updateTag(user.id, parseId(params.id, "tag id"), body) });
});

export const DELETE = route<{ id: string }>(async (_request, params, user) => {
  await deleteTag(user.id, parseId(params.id, "tag id"));
  return json({ ok: true });
});
