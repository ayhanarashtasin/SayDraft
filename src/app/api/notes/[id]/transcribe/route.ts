import { start } from "workflow/api";
import { isLanguageCode } from "@/lib/languages";
import { HttpError, badRequest, json, optionalBoolean, parseId, readJson } from "@/server/http";
import { getNote } from "@/server/notes";
import { claimTranscription, markTranscriptionFailed } from "@/server/pipeline";
import { route } from "@/server/route";
import { transcribeNote } from "@/workflows/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params, user) => {
  const noteId = parseId(params.id, "note id");
  const body = await readJson(request);
  const mode = body.mode === "all" ? "all" : body.mode === "pending" || body.mode === undefined ? "pending" : null;
  if (!mode) throw badRequest("mode must be \"pending\" or \"all\".");
  let language: string | undefined;
  if (body.language !== undefined && body.language !== null) {
    if (body.language !== "auto" && !isLanguageCode(body.language)) throw badRequest("Unknown language.");
    language = body.language as string;
  }
  const job = await claimTranscription(user.id, noteId, { mode, language, speakers: optionalBoolean(body.speakers, "speakers") });
  try {
    await start(transcribeNote, [job]);
  } catch (error) {
    console.error("Could not schedule transcription:", error);
    const message = "Could not start transcription. Try again.";
    await markTranscriptionFailed(job, message);
    throw new HttpError(503, "workflow_unavailable", message);
  }
  return json({ note: await getNote(user.id, noteId) }, { status: 202 });
});
