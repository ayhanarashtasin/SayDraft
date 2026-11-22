import { badRequest, json, readJson } from "@/server/http";
import { route } from "@/server/route";
import { addDictionaryWords, listDictionary } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json({ entries: await listDictionary(user.id) }));

/** { word } or { words: [...] } (up to 100 at once). */
export const POST = route(async (request, _params, user) => {
  const body = await readJson(request);
  const words = Array.isArray(body.words) ? body.words : body.word !== undefined ? [body.word] : null;
  if (!words || words.length === 0) throw badRequest("Enter at least one word.");
  const result = await addDictionaryWords(user.id, words);
  return json(result, { status: 201 });
});
