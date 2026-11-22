import {
  DEFAULT_UPLOAD_MAX_MB,
  DIRECT_AUDIO_EXTENSIONS,
  DIRECT_TRANSCRIBE_MAX_BYTES,
  EXT_TO_MIME,
  audioExtension,
  baseMime,
} from "../lib/limits.ts";
import type { AudioFile } from "../lib/types.ts";
import { hasFfmpeg } from "./audio.ts";
import { HttpError, badRequest, conflict, notFound, optionalString } from "./http.ts";
import { type AudioRow, deleteAudioFile, getAudioRow, newAudioFileName, recoverExpiredWork, toAudio } from "./notes.ts";
import { AUDIO_BUCKET, assertWorkspaceWrite, supabase } from "./supabase.ts";

export function maxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_MB);
  const megabytes = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 1024) : DEFAULT_UPLOAD_MAX_MB;
  const limit = Math.floor(megabytes * 1024 * 1024);
  return hasFfmpeg() ? limit : Math.min(limit, DIRECT_TRANSCRIBE_MAX_BYTES);
}

function resumableEndpoint(): string {
  const url = new URL((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!.trim());
  // Supabase recommends its direct Storage host for resumable uploads.
  if (/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  }
  return new URL("/storage/v1/upload/resumable/sign", url).toString();
}

/** Reserves a private object for a single note. File bytes go from the browser to Storage. */
export async function beginAudioUpload(noteId: number, input: Record<string, unknown>) {
  const originalName = optionalString(input.name, "File name", 200)?.trim() || null;
  const mime = baseMime(optionalString(input.type, "File type", 200));
  const extension = audioExtension(mime, originalName);
  if (!extension) throw new HttpError(415, "unsupported_type", "Choose a supported audio or video file.");
  if (!hasFfmpeg() && !DIRECT_AUDIO_EXTENSIONS.has(extension)) {
    throw new HttpError(415, "needs_ffmpeg", "This audio format requires ffmpeg.");
  }
  const { size, durationSec } = input;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) throw badRequest("The audio file is empty or invalid.", "no_audio");
  const limit = maxUploadBytes();
  if (size > limit) throw new HttpError(413, "too_large", `This file exceeds the ${limit / (1024 * 1024)} MB upload limit.`);
  const safeMime = /^(audio|video)\/[a-z0-9.+-]+$/.test(mime) ? mime : EXT_TO_MIME[extension] ?? "application/octet-stream";
  const fileName = newAudioFileName(extension);
  const client = supabase();
  await recoverExpiredWork(noteId);
  const row = assertWorkspaceWrite(await client.rpc("reserve_note_audio", {
    p_note_id: noteId,
    p_file_name: fileName,
    p_mime: safeMime,
    p_size: size,
    p_duration: typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec * 100) / 100 : null,
    p_original_name: originalName,
    p_now: Date.now(),
  }).single()) as AudioRow;
  const { data, error } = await client.storage.from(AUDIO_BUCKET).createSignedUploadUrl(fileName);
  if (error || !data) {
    await deleteAudioFile(noteId, row.id);
    throw new HttpError(502, "storage_unavailable", "Could not start the upload. Try again.");
  }
  return {
    audioId: Number(row.id),
    endpoint: resumableEndpoint(),
    token: data.token,
    bucketName: AUDIO_BUCKET,
    objectName: fileName,
    contentType: safeMime,
  };
}

/** Confirms the reserved object arrived before it can appear in the note or be transcribed. */
export async function finishAudioUpload(noteId: number, fileId: number): Promise<AudioFile> {
  const row = await getAudioRow(noteId, fileId, true);
  if (!row) throw notFound("Audio not found.");
  if (row.uploaded) return toAudio(row);
  const client = supabase();
  const { data, error } = await client.storage.from(AUDIO_BUCKET).info(row.file_name);
  if (error && Number(error.statusCode) !== 404) {
    throw new HttpError(502, "storage_unavailable", "Could not verify the audio upload. Try again.");
  }
  if (!data || Number(data.size) !== Number(row.size)) throw conflict("The audio upload is incomplete. Try uploading again.", "upload_incomplete");
  const result = assertWorkspaceWrite(await client.rpc("finalize_note_audio", {
    p_note_id: noteId, p_file_id: fileId, p_now: Date.now(),
  }).single()) as AudioRow;
  return toAudio(result);
}
