import { json, parseId, readJson } from "@/server/http";
import { deleteAction, updateAction } from "@/server/integrations";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params, user) => {
  const body = await readJson(request);
  return json({ action: await updateAction(user.id, parseId(params.id, "integration id"), body) });
});

export const DELETE = route<{ id: string }>(async (_request, params, user) => {
  await deleteAction(user.id, parseId(params.id, "integration id"));
  return json({ ok: true });
});
