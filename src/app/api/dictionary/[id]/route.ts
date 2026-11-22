import { json, parseId, readJson, route } from "@/server/http";
import { deleteDictionaryWord, updateDictionaryWord } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params) => {
  const body = await readJson(request);
  return json({ entry: await updateDictionaryWord(parseId(params.id, "entry id"), body.word) });
});

export const DELETE = route<{ id: string }>(async (_request, params) => {
  await deleteDictionaryWord(parseId(params.id, "entry id"));
  return json({ ok: true });
});
