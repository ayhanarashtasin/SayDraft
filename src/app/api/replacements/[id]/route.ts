import { json, parseId, readJson, route } from "@/server/http";
import { deleteReplacement, updateReplacement } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params) => {
  const body = await readJson(request);
  return json({ replacement: await updateReplacement(parseId(params.id, "replacement id"), body) });
});

export const DELETE = route<{ id: string }>(async (_request, params) => {
  await deleteReplacement(parseId(params.id, "replacement id"));
  return json({ ok: true });
});
