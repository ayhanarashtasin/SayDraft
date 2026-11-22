import { json, readJson } from "@/server/http";
import { createPrompt, listPrompts } from "@/server/prompts";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json({ prompts: await listPrompts(user.id) }));

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  return json({ prompt: await createPrompt(user.id, body) }, { status: 201 });
});
