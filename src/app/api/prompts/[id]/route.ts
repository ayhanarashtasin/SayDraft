import { badRequest, json, parseId, readJson } from "@/server/http";
import { deletePrompt, movePrompt, requirePrompt, updatePrompt } from "@/server/prompts";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_request, params, user) => json({ prompt: await requirePrompt(user.id, parseId(params.id, "prompt id")) }));

/** Updates fields, or reorders with { move: "up" | "down" }. */
export const PATCH = route<{ id: string }>(async (request, params, user) => {
  const id = parseId(params.id, "prompt id");
  const body = await readJson(request);
  if (body.move !== undefined) {
    if (body.move !== "up" && body.move !== "down") throw badRequest("move must be \"up\" or \"down\".");
    return json({ prompts: await movePrompt(user.id, id, body.move) });
  }
  return json({ prompt: await updatePrompt(user.id, id, body) });
});

export const DELETE = route<{ id: string }>(async (_request, params, user) => {
  await deletePrompt(user.id, parseId(params.id, "prompt id"));
  return json({ ok: true });
});
