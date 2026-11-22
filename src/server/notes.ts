import crypto from "node:crypto";
import path from "node:path";
import type {
  AudioFile,
  Note,
  NoteFilter,
  NoteListItem,
  NoteSource,
  NoteStatus,
  Rewrite,
  RewriteKind,
  RewriteStatus,
  SortMode,
  Tag,
} from "../lib/types.ts";
import { conflict, notFound } from "./http.ts";
import { assertOk, assertWorkspaceWrite, copyAudioObject, deleteAudioObject, supabase } from "./supabase.ts";

export interface NoteRow {
  id: number;
  title: string;
  transcript: string;
  status: NoteStatus;
  stage: string | null;
  progress: number | null;
  transcription_id: string | null;
  transcription_deadline: number | null;
  error: string | null;
  source: NoteSource;
  language: string | null;
  speakers: boolean;
  archived: boolean;
  created_at: number;
  updated_at: number;
}

export interface AudioRow {
  id: number;
  note_id: number;
  file_name: string;
  mime: string;
  size: number;
  duration_sec: number | null;
  original_name: string | null;
  position: number;
  prepared: boolean;
  status: "pending" | "ready" | "failed";
  transcript: string | null;
  uploaded: boolean;
  created_at: number;
}

interface RewriteRow {
  id: number;
  note_id: number;
  kind: RewriteKind;
  prompt_id: number | null;
  label: string;
  language: string | null;
  instruction: string | null;
  source_rewrite_id: number | null;
  status: RewriteStatus;
  error: string | null;
  text: string;
  created_at: number;
  updated_at: number;
}

interface TagRow {
  id: number;
  title: string;
  color: string;
  position: number;
  created_at: number;
}

function toTag(row: TagRow): Tag {
  return { id: Number(row.id), title: row.title, color: row.color, position: row.position, createdAt: Number(row.created_at) };
}

export function toAudio(row: AudioRow): AudioFile {
  return {
    id: Number(row.id),
    noteId: Number(row.note_id),
    mime: row.mime,
    size: Number(row.size),
    durationSec: row.duration_sec,
    originalName: row.original_name,
    position: row.position,
    status: row.status,
    createdAt: Number(row.created_at),
  };
}

export function toRewrite(row: RewriteRow): Rewrite {
  return {
    id: Number(row.id),
    noteId: Number(row.note_id),
    kind: row.kind,
    promptId: row.prompt_id ? Number(row.prompt_id) : null,
    label: row.label,
    language: row.language,
    instruction: row.instruction,
    sourceRewriteId: row.source_rewrite_id ? Number(row.source_rewrite_id) : null,
    status: row.status,
    error: row.error,
    text: row.text,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function tagsForNotes(ids: number[]): Promise<Map<number, Tag[]>> {
  const result = new Map<number, Tag[]>();
  if (ids.length === 0) return result;
  const rows = assertOk(
    await supabase().from("note_tags").select("note_id, tags(id, title, color, position, created_at)").in("note_id", ids),
  ) as unknown as Array<{ note_id: number; tags: TagRow | null }>;
  for (const row of rows) {
    if (!row.tags) continue;
    const noteId = Number(row.note_id);
    const list = result.get(noteId) ?? [];
    list.push(toTag(row.tags));
    result.set(noteId, list);
  }
  for (const list of result.values()) {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }
  return result;
}

export interface ListOptions {
  filter?: NoteFilter;
  tagId?: number;
  q?: string;
  sortBy?: SortMode;
  limit?: number;
}

export async function listNotes(options: ListOptions = {}): Promise<NoteListItem[]> {
  await recoverExpiredWork();
  const client = supabase();
  const orderCol = options.sortBy === "createdAt" ? "created_at" : "updated_at";
  const limit = Math.min(Math.max(options.limit ?? 2000, 1), 5000);
  const archived = options.filter === "archive";

  const rows = assertOk(
    await client
      .from("notes")
      .select("id, title, transcript, status, stage, progress, error, source, language, speakers, archived, created_at, updated_at")
      .eq("archived", archived)
      .order(orderCol, { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
  ) as NoteRow[];

  if (rows.length === 0) return [];
  const ids = rows.map((row) => Number(row.id));
  const query = options.q?.trim().toLowerCase() ?? "";

  const [tagsMap, audioRows, rewriteRows] = await Promise.all([
    tagsForNotes(ids),
    assertOk(await client.from("audio_files").select("note_id, duration_sec").eq("uploaded", true).in("note_id", ids)) as Array<{
      note_id: number;
      duration_sec: number | null;
    }>,
    assertOk(
      await client
        .from("rewrites")
        .select(query ? "note_id, status, text" : "note_id, status")
        .in("note_id", ids),
    ) as unknown as Array<{ note_id: number; status: RewriteStatus; text?: string }>,
  ]);

  const audioByNote = new Map<number, { count: number; duration: number | null }>();
  for (const audio of audioRows) {
    const id = Number(audio.note_id);
    const cur = audioByNote.get(id) ?? { count: 0, duration: null };
    cur.count += 1;
    if (typeof audio.duration_sec === "number") {
      cur.duration = Math.round(((cur.duration ?? 0) + audio.duration_sec) * 100) / 100;
    }
    audioByNote.set(id, cur);
  }

  const rewritesByNote = new Map<number, { count: number; processing: number; matched: boolean }>();
  for (const rw of rewriteRows) {
    const id = Number(rw.note_id);
    const cur = rewritesByNote.get(id) ?? { count: 0, processing: 0, matched: false };
    cur.count += 1;
    if (rw.status === "processing") cur.processing += 1;
    if (query && rw.text && rw.text.toLowerCase().includes(query)) cur.matched = true;
    rewritesByNote.set(id, cur);
  }

  const items: NoteListItem[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    const noteTags = tagsMap.get(id) ?? [];
    if (!archived) {
      if (options.filter === "unsorted" && noteTags.length > 0) continue;
      if (options.filter === "tag" && options.tagId && !noteTags.some((tag) => tag.id === options.tagId)) continue;
    }
    const rw = rewritesByNote.get(id);
    if (query) {
      const hit =
        row.title.toLowerCase().includes(query) ||
        row.transcript.toLowerCase().includes(query) ||
        Boolean(rw?.matched);
      if (!hit) continue;
    }
    const audio = audioByNote.get(id);
    items.push({
      id,
      title: row.title,
      preview: row.transcript.slice(0, 400),
      status: row.status,
      stage: row.stage,
      progress: row.progress,
      error: row.error,
      source: row.source,
      language: row.language,
      speakers: Boolean(row.speakers),
      archived: Boolean(row.archived),
      durationSec: audio?.duration ?? null,
      tags: noteTags,
      audioCount: audio?.count ?? 0,
      rewriteCount: rw?.count ?? 0,
      rewritesProcessing: rw?.processing ?? 0,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    });
  }
  return items;
}

export async function getNoteRow(id: number): Promise<NoteRow | null> {
  return assertOk(await supabase().from("notes").select("*").eq("id", id).maybeSingle()) as NoteRow | null;
}

export async function noteExists(id: number): Promise<boolean> {
  const { data } = await supabase().from("notes").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

export async function getNote(id: number): Promise<Note | null> {
  await recoverExpiredWork(id);
  const row = await getNoteRow(id);
  if (!row) return null;
  const [audioRows, rewriteRows, tagsMap] = await Promise.all([
    listAudioRows(id),
    assertOk(
      await supabase().from("rewrites").select("*").eq("note_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }),
    ) as RewriteRow[],
    tagsForNotes([id]),
  ]);
  const knownDurations = audioRows.map((audio) => audio.duration_sec).filter((value): value is number => typeof value === "number");
  return {
    id: Number(row.id),
    title: row.title,
    transcript: row.transcript,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    error: row.error,
    source: row.source,
    language: row.language,
    speakers: Boolean(row.speakers),
    archived: Boolean(row.archived),
    durationSec: knownDurations.length ? Math.round(knownDurations.reduce((sum, value) => sum + value, 0) * 100) / 100 : null,
    tags: tagsMap.get(id) ?? [],
    audioFiles: audioRows.map(toAudio),
    rewrites: rewriteRows.map(toRewrite),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function requireNote(id: number): Promise<Note> {
  const note = await getNote(id);
  if (!note) throw notFound("Note not found.");
  return note;
}

async function setNoteTags(noteId: number, tagIds: number[]): Promise<void> {
  const client = supabase();
  assertOk(await client.from("note_tags").delete().eq("note_id", noteId));
  if (tagIds.length === 0) return;
  const valid = assertOk(await client.from("tags").select("id").in("id", tagIds)) as Array<{ id: number }>;
  if (valid.length === 0) return;
  assertOk(
    await client
      .from("note_tags")
      .upsert(
        valid.map((t) => ({ note_id: noteId, tag_id: Number(t.id) })),
        { onConflict: "note_id,tag_id", ignoreDuplicates: true },
      ),
  );
}

export interface CreateNoteInput {
  title?: string;
  transcript?: string;
  source: NoteSource;
  status?: NoteStatus;
  language?: string | null;
  speakers?: boolean;
  tagIds?: number[];
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const now = Date.now();
  const inserted = assertOk(
    await supabase()
      .from("notes")
      .insert({
        title: (input.title ?? "").trim(),
        transcript: input.transcript ?? "",
        status: input.status ?? "ready",
        source: input.source,
        language: input.language ?? null,
        speakers: Boolean(input.speakers),
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single(),
  ) as { id: number };
  const noteId = Number(inserted.id);
  if (input.tagIds?.length) await setNoteTags(noteId, input.tagIds);
  return (await getNote(noteId))!;
}

export interface UpdateNoteInput {
  title?: string;
  transcript?: string;
  archived?: boolean;
  tagIds?: number[];
}

export async function updateNote(id: number, patch: UpdateNoteInput): Promise<Note | null> {
  if (!(await noteExists(id))) return null;
  const updates: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.transcript !== undefined) updates.transcript = patch.transcript;
  if (patch.archived !== undefined) updates.archived = patch.archived;
  assertOk(await supabase().from("notes").update(updates).eq("id", id));
  if (patch.tagIds) await setNoteTags(id, patch.tagIds);
  return getNote(id);
}

/** Only recovers work after its deadline, including work started by another instance. */
export async function recoverExpiredWork(noteId?: number): Promise<void> {
  const now = Date.now();
  const client = supabase();
  const failed = { status: "failed", stage: null, progress: null, updated_at: now };
  const legacyCutoff = now - 10 * 60_000;
  const transcripts = client.from("notes")
    .update({ ...failed, transcription_deadline: null, error: "Transcription was interrupted. Retry to continue." })
    .eq("status", "processing")
    .or(`transcription_deadline.lt.${now},and(transcription_deadline.is.null,updated_at.lt.${legacyCutoff})`);
  const uploads = client.from("notes")
    .update({ ...failed, error: "The upload was interrupted. Retry with the audio that arrived, or record again." })
    .eq("status", "uploading").lt("updated_at", now - 2 * 60 * 60_000);
  const rewrites = client.from("rewrites")
    .update({ status: "failed", error: "The rewrite was interrupted. Try again.", updated_at: now })
    .eq("status", "processing").lt("updated_at", legacyCutoff);
  if (noteId !== undefined) {
    transcripts.eq("id", noteId);
    uploads.eq("id", noteId);
    rewrites.eq("note_id", noteId);
  }
  for (const result of await Promise.all([transcripts, uploads, rewrites])) assertOk(result);
}

export async function touchNote(id: number): Promise<void> {
  await supabase().from("notes").update({ updated_at: Date.now() }).eq("id", id);
}

// ---------------------------------------------------------------- audio files

export function newAudioFileName(extension: string): string {
  const safe = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${crypto.randomUUID()}.${safe}`;
}

export async function listAudioRows(noteId: number): Promise<AudioRow[]> {
  return assertOk(
    await supabase().from("audio_files").select("*").eq("note_id", noteId).eq("uploaded", true)
      .order("position", { ascending: true }).order("id", { ascending: true }),
  ) as AudioRow[];
}

export async function getAudioRow(noteId: number, fileId: number, includeUnfinished = false): Promise<AudioRow | null> {
  const query = supabase().from("audio_files").select("*").eq("id", fileId).eq("note_id", noteId);
  if (!includeUnfinished) query.eq("uploaded", true);
  return assertOk(
    await query.maybeSingle(),
  ) as AudioRow | null;
}

export interface NewAudioFile {
  fileName: string;
  mime: string;
  size: number;
  durationSec: number | null;
  originalName: string | null;
  prepared?: boolean;
  status?: AudioRow["status"];
  transcript?: string | null;
}

export async function insertAudioFile(noteId: number, file: NewAudioFile): Promise<AudioFile> {
  const existing = assertOk(await supabase().from("audio_files").select("position").eq("note_id", noteId)) as Array<{ position: number }>;
  const nextPosition = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const row = assertOk(
    await supabase()
      .from("audio_files")
      .insert({
        note_id: noteId,
        file_name: file.fileName,
        mime: file.mime,
        size: file.size,
        duration_sec: file.durationSec,
        original_name: file.originalName,
        position: nextPosition,
        prepared: Boolean(file.prepared),
        status: file.status ?? "pending",
        transcript: file.transcript ?? null,
        created_at: Date.now(),
      })
      .select("*")
      .single(),
  ) as AudioRow;
  return toAudio(row);
}

export async function deleteAudioFile(noteId: number, fileId: number): Promise<boolean> {
  await recoverExpiredWork(noteId);
  const fileName = assertWorkspaceWrite(await supabase().rpc("remove_note_audio", {
    p_note_id: noteId, p_file_id: fileId, p_now: Date.now(),
  })) as string | null;
  if (!fileName) return false;
  await deleteAudioObject(fileName);
  return true;
}

// ---------------------------------------------------------------- rewrites

export interface NewRewrite {
  kind: RewriteKind;
  promptId: number | null;
  label: string;
  language: string | null;
  instruction: string | null;
  sourceRewriteId: number | null;
  status: RewriteStatus;
  text?: string;
}

export async function insertRewrite(noteId: number, input: NewRewrite): Promise<Rewrite> {
  const now = Date.now();
  const row = assertOk(
    await supabase()
      .from("rewrites")
      .insert({
        note_id: noteId,
        kind: input.kind,
        prompt_id: input.promptId,
        label: input.label,
        language: input.language,
        instruction: input.instruction,
        source_rewrite_id: input.sourceRewriteId,
        status: input.status,
        text: input.text ?? "",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single(),
  ) as RewriteRow;
  await touchNote(noteId);
  return toRewrite(row);
}

export async function getRewriteById(id: number): Promise<Rewrite | null> {
  const row = assertOk(await supabase().from("rewrites").select("*").eq("id", id).maybeSingle()) as RewriteRow | null;
  return row ? toRewrite(row) : null;
}

export async function getRewrite(noteId: number, rewriteId: number): Promise<Rewrite | null> {
  const rewrite = await getRewriteById(rewriteId);
  return rewrite && rewrite.noteId === noteId ? rewrite : null;
}

export async function updateRewrite(
  id: number,
  patch: { text?: string; status?: RewriteStatus; error?: string | null },
): Promise<Rewrite | null> {
  const updates: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.text !== undefined) updates.text = patch.text;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.error !== undefined) updates.error = patch.error;
  const row = assertOk(
    await supabase().from("rewrites").update(updates).eq("id", id).select("*").maybeSingle(),
  ) as RewriteRow | null;
  if (!row) return null;
  await touchNote(Number(row.note_id));
  return toRewrite(row);
}

export async function deleteRewrite(noteId: number, rewriteId: number): Promise<boolean> {
  const deleted = assertOk(
    await supabase().from("rewrites").delete().eq("id", rewriteId).eq("note_id", noteId).select("id"),
  ) as Array<{ id: number }>;
  if (deleted.length === 0) return false;
  await touchNote(noteId);
  return true;
}

// ---------------------------------------------------------------- bulk operations

export async function deleteNotes(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = assertOk(await supabase().rpc("delete_workspace_notes", { p_note_ids: ids })) as { deleted: number; audio: string[] };
  await Promise.all(result.audio.map(deleteAudioObject));
  return result.deleted;
}

export async function archiveNotes(ids: number[], archived: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = assertOk(
    await supabase().from("notes").update({ archived, updated_at: Date.now() }).in("id", ids).select("id"),
  ) as Array<{ id: number }>;
  return updated.length;
}

export async function tagNotes(ids: number[], tagId: number, add: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  const client = supabase();
  if (add) {
    const existing = assertOk(
      await client.from("note_tags").select("note_id").eq("tag_id", tagId).in("note_id", ids),
    ) as Array<{ note_id: number }>;
    const already = new Set(existing.map((row) => Number(row.note_id)));
    const toAdd = ids.filter((id) => !already.has(id));
    if (toAdd.length === 0) return 0;
    const inserted = assertOk(
      await client
        .from("note_tags")
        .upsert(
          toAdd.map((note_id) => ({ note_id, tag_id: tagId })),
          { onConflict: "note_id,tag_id", ignoreDuplicates: true },
        )
        .select("note_id"),
    ) as Array<{ note_id: number }>;
    return inserted.length;
  }
  const deleted = assertOk(
    await client.from("note_tags").delete().eq("tag_id", tagId).in("note_id", ids).select("note_id"),
  ) as Array<{ note_id: number }>;
  return deleted.length;
}

export interface MergeOptions {
  title?: string;
  archiveOriginals?: boolean;
}

/** Combines notes (oldest first) into a new note with their text, audio and tags. */
export async function mergeNotes(ids: number[], options: MergeOptions = {}): Promise<Note> {
  const client = supabase();
  const rows = assertOk(
    await client.from("notes").select("*").in("id", ids).order("created_at", { ascending: true }).order("id", { ascending: true }),
  ) as NoteRow[];
  if (rows.length < 2) throw notFound("Select at least two existing notes to merge.");
  if (rows.some((row) => row.status === "processing" || row.status === "uploading")) {
    throw conflict("Wait until all selected notes finish processing before merging them.", "note_busy");
  }

  const transcript = rows.map((row) => row.transcript.trim()).filter(Boolean).join("\n\n");
  const title = options.title?.trim() || `${rows[0].title || "Untitled note"} + ${rows.length - 1} more`;
  const rowIds = rows.map((row) => Number(row.id));
  const tagLinks = assertOk(await client.from("note_tags").select("tag_id").in("note_id", rowIds)) as Array<{ tag_id: number }>;
  const tagIds = [...new Set(tagLinks.map((row) => Number(row.tag_id)))];

  const copies: Array<{ source: AudioRow; fileName: string }> = [];
  try {
    for (const row of rows) {
      for (const audio of await listAudioRows(Number(row.id))) {
        const extension = path.extname(audio.file_name).slice(1) || "bin";
        const fileName = newAudioFileName(extension);
        await copyAudioObject(audio.file_name, fileName);
        copies.push({ source: audio, fileName });
      }
    }
  } catch (error) {
    await Promise.all(copies.map((copy) => deleteAudioObject(copy.fileName)));
    throw error;
  }

  const languages = new Set(rows.map((row) => row.language).filter(Boolean));
  const note = await createNote({
    title,
    transcript,
    source: "merge",
    language: languages.size === 1 ? ([...languages][0] as string) : null,
    speakers: rows.some((row) => Boolean(row.speakers)),
    tagIds,
  });
  for (const copy of copies) {
    await insertAudioFile(note.id, {
      fileName: copy.fileName,
      mime: copy.source.mime,
      size: copy.source.size,
      durationSec: copy.source.duration_sec,
      originalName: copy.source.original_name,
      prepared: Boolean(copy.source.prepared),
      status: copy.source.status,
      transcript: copy.source.transcript,
    });
  }
  if (options.archiveOriginals) await archiveNotes(rowIds, true);
  return (await getNote(note.id))!;
}

export async function libraryStats(): Promise<{
  notes: number;
  archived: number;
  audioFiles: number;
  audioBytes: number;
  audioSeconds: number;
  rewrites: number;
}> {
  const client = supabase();
  const [notesRows, audioRows, rewritesRes] = await Promise.all([
    assertOk(await client.from("notes").select("archived")) as Array<{ archived: boolean }>,
    assertOk(await client.from("audio_files").select("size, duration_sec").eq("uploaded", true)) as Array<{ size: number; duration_sec: number | null }>,
    client.from("rewrites").select("id", { count: "exact", head: true }),
  ]);
  return {
    notes: notesRows.length,
    archived: notesRows.filter((row) => row.archived).length,
    audioFiles: audioRows.length,
    audioBytes: audioRows.reduce((sum, row) => sum + Number(row.size || 0), 0),
    audioSeconds: audioRows.reduce((sum, row) => sum + Number(row.duration_sec || 0), 0),
    rewrites: rewritesRes.count ?? 0,
  };
}
