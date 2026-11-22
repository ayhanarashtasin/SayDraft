import { json, parseId, readJson, route } from "@/server/http";
import { beginAudioUpload } from "@/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params) => {
  const upload = await beginAudioUpload(parseId(params.id, "note id"), await readJson(request, 8_000));
  return json({ upload }, { status: 201 });
});
