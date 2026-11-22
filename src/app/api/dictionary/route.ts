import { badRequest, json, readJson, route } from "@/server/http";
import { addDictionaryWords, listDictionary } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json({ entries: await listDictionary() }));

/** { word } or { words: [...] } (up to 100 at once). */
export const POST = route(async (request) => {
  const body = await readJson(request);
  const words = Array.isArray(body.words) ? body.words : body.word !== undefined ? [body.word] : null;
  if (!words || words.length === 0) throw badRequest("Enter at least one word.");
  const result = await addDictionaryWords(words);
  return json(result, { status: 201 });
});
