import { isLanguageCode } from "@/lib/languages";
import { NOTE_TEXT_MAX, TITLE_MAX } from "@/lib/limits";
import type { NoteFilter, NoteSource, SortMode } from "@/lib/types";
import { badRequest, idList, json, optionalBoolean, optionalString, readJson } from "@/server/http";
import { createNote, listNotes } from "@/server/notes";
import { titleForText } from "@/server/pipeline";
import { route } from "@/server/route";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS: NoteFilter[] = ["all", "unsorted", "archive", "tag"];
const AUDIO_SOURCES: NoteSource[] = ["recording", "meeting", "upload"];

export const GET = route(async (request, _params, user) => {
  const params = request.nextUrl.searchParams;
  const rawFilter = params.get("filter") as NoteFilter | null;
  const filter = rawFilter && FILTERS.includes(rawFilter) ? rawFilter : "all";
  const tagId = Number(params.get("tagId"));
  const sortBy: SortMode = params.get("sortBy") === "createdAt" ? "createdAt" : "updatedAt";
  const notes = await listNotes(user.id, {
    filter,
    tagId: Number.isSafeInteger(tagId) && tagId > 0 ? tagId : undefined,
    q: params.get("q")?.slice(0, 200) || undefined,
    sortBy,
  });
  return json({ notes });
});

export const POST = route(async (request, _params, user) => {
  const body = await readJson(request, NOTE_TEXT_MAX * 4 + 10_000);
  const tagIds = body.tagIds === undefined ? [] : idList(body.tagIds, "tagIds", 100);

  if (body.kind === "audio") {
    const source = AUDIO_SOURCES.includes(body.source as NoteSource) ? (body.source as NoteSource) : null;
    if (!source) throw badRequest("Unknown audio source.");
    const language = body.language === undefined || body.language === null ? null : String(body.language);
    if (language !== null && language !== "auto" && !isLanguageCode(language)) throw badRequest("Unknown language.");
    const speakers = optionalBoolean(body.speakers, "speakers") ?? false;
    if (speakers && !(await getSettings(user.id)).diarizeModel) {
      throw badRequest("Speaker separation is turned off. Choose a speaker separation model in Settings → Preferences.");
    }
    const note = await createNote(user.id, { source, status: "uploading", language, speakers, tagIds });
    return json({ note }, { status: 201 });
  }

  const transcript = optionalString(body.transcript, "Note text", NOTE_TEXT_MAX)?.trim() ?? "";
  if (!transcript) throw badRequest("Write something before saving the note.");
  const title = optionalString(body.title, "Title", TITLE_MAX)?.trim() || (await titleForText(user.id, transcript));
  const note = await createNote(user.id, { title, transcript, source: "text", tagIds });
  return json({ note }, { status: 201 });
});
