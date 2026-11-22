import { badRequest, json, optionalBoolean, readJson, route } from "@/server/http";
import { promptFromTemplate } from "@/server/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adds a gallery template to the user's prompts: { values?: { key: value }, favorite?: boolean } */
export const POST = route<{ id: string }>(async (request, params) => {
  const body = await readJson(request);
  if (body.values !== undefined && (typeof body.values !== "object" || body.values === null || Array.isArray(body.values))) {
    throw badRequest("values must be an object.");
  }
  const prompt = await promptFromTemplate(
    params.id,
    body.values as Record<string, unknown> | undefined,
    optionalBoolean(body.favorite, "favorite") ?? false,
  );
  return json({ prompt }, { status: 201 });
});
