import { json, readJson, route } from "@/server/http";
import { createPrompt, listPrompts } from "@/server/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ prompts: await listPrompts() }));

export const POST = route(async (request) => {
  const body = await readJson(request);
  return json({ prompt: await createPrompt(body) }, { status: 201 });
});
