import { json, readJson } from "@/server/http";
import { route } from "@/server/route";
import { createReplacement, listReplacements } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json({ replacements: await listReplacements(user.id) }));

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  return json({ replacement: await createReplacement(user.id, body) }, { status: 201 });
});
