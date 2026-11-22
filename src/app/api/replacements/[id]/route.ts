import { json, parseId, readJson } from "@/server/http";
import { route } from "@/server/route";
import { deleteReplacement, updateReplacement } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params, user) => {
  const body = await readJson(request);
  return json({ replacement: await updateReplacement(user.id, parseId(params.id, "replacement id"), body) });
});

export const DELETE = route<{ id: string }>(async (_request, params, user) => {
  await deleteReplacement(user.id, parseId(params.id, "replacement id"));
  return json({ ok: true });
});
