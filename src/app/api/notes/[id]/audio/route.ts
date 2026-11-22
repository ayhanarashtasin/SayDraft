import { json, parseId, readJson } from "@/server/http";
import { route } from "@/server/route";
import { beginAudioUpload } from "@/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params, user) => {
  const upload = await beginAudioUpload(user.id, parseId(params.id, "note id"), await readJson(request, 8_000));
  return json({ upload }, { status: 201 });
});
