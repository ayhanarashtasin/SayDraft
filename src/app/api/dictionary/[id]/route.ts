import { json, parseId, readJson } from "@/server/http";
import { route } from "@/server/route";
import { deleteDictionaryWord, updateDictionaryWord } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params, user) => {
  const body = await readJson(request);
  return json({ entry: await updateDictionaryWord(user.id, parseId(params.id, "entry id"), body.word) });
});

export const DELETE = route<{ id: string }>(async (_request, params, user) => {
  await deleteDictionaryWord(user.id, parseId(params.id, "entry id"));
  return json({ ok: true });
});
