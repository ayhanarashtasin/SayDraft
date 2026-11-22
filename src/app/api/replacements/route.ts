import { json, readJson, route } from "@/server/http";
import { createReplacement, listReplacements } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ replacements: await listReplacements() }));

export const POST = route(async (request) => {
  const body = await readJson(request);
  return json({ replacement: await createReplacement(body) }, { status: 201 });
});
