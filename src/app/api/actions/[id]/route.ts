import { json, parseId, readJson, route } from "@/server/http";
import { deleteAction, updateAction } from "@/server/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params) => {
  const body = await readJson(request);
  return json({ action: await updateAction(parseId(params.id, "integration id"), body) });
});

export const DELETE = route<{ id: string }>(async (_request, params) => {
  await deleteAction(parseId(params.id, "integration id"));
  return json({ ok: true });
});
