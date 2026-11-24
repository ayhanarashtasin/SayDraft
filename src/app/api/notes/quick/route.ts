import fs from "node:fs";
import path from "node:path";
import { after } from "next/server";
import { isLanguageCode } from "@/lib/languages";
import {
  DIRECT_AUDIO_EXTENSIONS,
  DIRECT_TRANSCRIBE_MAX_SEC,
  EXT_TO_MIME,
  QUICK_AUDIO_MAX_BYTES,
  audioExtension,
  baseMime,
} from "@/lib/limits";
import { applyReplacements, fallbackTitle, formatSpeakerSegments, joinTranscriptParts } from "@/lib/text";
import type { AudioFile, Note, NoteSource } from "@/lib/types";
import { hasFfmpeg, probeAudio, remuxAudio } from "@/server/audio";
import { HttpError, badRequest, conflict, json, notFound, parseId } from "@/server/http";
import { triggerAutomaticActions } from "@/server/integrations";
import { getNote, getNoteRow, insertAudioFile, newAudioFileName, recoverExpiredWork } from "@/server/notes";
import { aiConfig, resolveSpeakerTranscription, transcribe } from "@/server/openai";
import { generateTitle } from "@/server/pipeline";
import { prepareRewrite } from "@/server/rewrite";
import { route } from "@/server/route";
import { getSettings } from "@/server/settings";
import { assertOk, deleteAudioObject, owned, supabase, tempDir, uploadAudioObject } from "@/server/supabase";
import { maxUploadBytes } from "@/server/uploads";
import { dictionaryPrompt, listReplacements } from "@/server/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AUDIO_SOURCES: NoteSource[] = ["recording", "meeting", "upload"];
const REMUX_EXTENSIONS = new Set(["webm", "ogg", "m4a", "mp4"]);

async function remuxInBackground(audioId: number, oldFileName: string, extension: string, audio: Blob): Promise<void> {
  if (!hasFfmpeg() || !REMUX_EXTENSIONS.has(extension)) return;
  const signal = AbortSignal.timeout(90_000);
  const workDir = fs.mkdtempSync(path.join(tempDir(), "quick-remux-"));
  try {
    const input = path.join(workDir, `in.${extension}`);
    const outputName = newAudioFileName(extension);
    const output = path.join(workDir, outputName);
    await fs.promises.writeFile(input, new Uint8Array(await audio.arrayBuffer()));
    let media = input;
    try {
      await remuxAudio(input, output, signal);
      media = output;
    } catch {
      return;
    }
    const probe = await probeAudio(media, signal);
    if (!probe.hasAudio || probe.durationSec === null) return;
    const remuxedSize = fs.statSync(output).size;
    await uploadAudioObject(outputName, await fs.openAsBlob(output, { type: audio.type }), audio.type);
    const updated = await supabase()
      .from("audio_files")
      .update({ file_name: outputName, size: remuxedSize, duration_sec: probe.durationSec, prepared: true })
      .eq("id", audioId)
      .eq("file_name", oldFileName)
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      await deleteAudioObject(outputName);
      return;
    }
    await deleteAudioObject(oldFileName);
  } catch (error) {
    console.warn("Background audio remux failed:", error instanceof Error ? error.message : error);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Single-request fast path for short direct-format voice notes (<= 4 MB, <= 20 min).
 * Runs AI transcription on the in-memory Blob in parallel with uploading the audio to Storage,
 * saves the transcript immediately, and defers AI title upgrade, WebM seek-index remux,
 * automatic actions, and auto-rewrite to `after()`.
 */
export const POST = route(async (request, _params, user) => {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(415, "multipart_required", "Send audio as multipart/form-data.");
  }

  const form = await request.formData();
  const fileEntry = form.get("file");
  if (!(fileEntry instanceof Blob)) throw badRequest("Audio file is required.", "no_audio");

  const cap = Math.min(QUICK_AUDIO_MAX_BYTES, maxUploadBytes());
  if (fileEntry.size <= 0) throw badRequest("The audio file is empty or invalid.", "no_audio");
  if (fileEntry.size > cap) throw new HttpError(413, "too_large", "Audio is too large for fast upload.");

  const rawSource = String(form.get("source") ?? "recording");
  if (!AUDIO_SOURCES.includes(rawSource as NoteSource)) throw badRequest("Unknown audio source.");
  const source = rawSource as Extract<NoteSource, "recording" | "meeting" | "upload">;

  const rawLanguage = form.get("language");
  const language = rawLanguage === null || rawLanguage === "" ? "auto" : String(rawLanguage);
  if (language !== "auto" && !isLanguageCode(language)) throw badRequest("Unknown language.");

  const speakers = String(form.get("speakers") ?? "false") === "true";

  const rawDuration = form.get("durationSec");
  const parsedDuration = rawDuration !== null && rawDuration !== "" ? Number(rawDuration) : null;
  const durationSec =
    parsedDuration !== null && Number.isFinite(parsedDuration) && parsedDuration > 0
      ? Math.round(parsedDuration * 100) / 100
      : null;
  if (durationSec !== null && durationSec > DIRECT_TRANSCRIBE_MAX_SEC) {
    throw new HttpError(413, "too_large", "Audio is too long for fast upload.");
  }

  const rawAppend = form.get("appendTo");
  const appendTo = rawAppend !== null && rawAppend !== "" ? parseId(String(rawAppend), "note id") : null;

  const originalName =
    (typeof form.get("name") === "string" ? String(form.get("name")) : fileEntry instanceof File ? fileEntry.name : "")
      .trim()
      .slice(0, 200) || null;
  const mime = baseMime(fileEntry.type);
  const extension = audioExtension(mime, originalName);
  if (!extension || !DIRECT_AUDIO_EXTENSIONS.has(extension)) {
    throw new HttpError(415, "unsupported_type", "Audio format requires standard conversion.");
  }
  const safeMime = /^(audio|video)\/[a-z0-9.+-]+$/.test(mime) ? mime : EXT_TO_MIME[extension] ?? "application/octet-stream";

  if (!aiConfig().configured) {
    throw new HttpError(503, "key_missing", "AI transcription is not configured on the server yet.");
  }

  // Parallel preflight: load user settings, target note (if appending), dictionary, and replacements in 1 round trip.
  if (appendTo) await recoverExpiredWork(appendTo);
  const [settings, existingNote, dictPrompt, replacements] = await Promise.all([
    getSettings(user.id),
    appendTo ? getNoteRow(user.id, appendTo) : Promise.resolve(null),
    dictionaryPrompt(user.id),
    listReplacements(user.id),
  ]);

  if (appendTo && !existingNote) throw notFound("Note not found.");
  if (existingNote?.status === "processing") {
    throw conflict("Wait until this note finishes processing before adding audio.", "note_busy");
  }
  const speakerTranscription = speakers ? resolveSpeakerTranscription(settings) : null;
  if (speakers && !speakerTranscription) {
    throw badRequest("Speaker separation is turned off. Choose a speaker separation model in Settings → Preferences.");
  }

  const effectiveLanguage = language === "auto" ? settings.defaultLanguage : language;
  const transcribeLanguage = effectiveLanguage === "auto" ? undefined : effectiveLanguage;
  const model = speakerTranscription?.model ?? settings.transcribeModel;
  const speakerLabelModel = speakerTranscription?.speakerLabelModel;
  const prompt = settings.useDictionary && (!speakers || speakerLabelModel) ? dictPrompt : undefined;
  const storageName = newAudioFileName(extension);

  const audio = fileEntry.type === safeMime ? fileEntry : fileEntry.slice(0, fileEntry.size, safeMime);
  const signal = AbortSignal.timeout(120_000);

  // Fire AI transcription and Supabase Storage upload simultaneously.
  const [transcribeOutcome, uploadOutcome] = await Promise.allSettled([
    transcribe({
      blob: audio,
      fileName: originalName || `recording.${extension}`,
      mime: safeMime,
      model,
      language: transcribeLanguage,
      prompt,
      diarize: speakers,
      speakerLabelModel,
      signal,
    }),
    uploadAudioObject(storageName, audio, safeMime),
  ]);

  if (uploadOutcome.status === "rejected") {
    throw new HttpError(502, "storage_unavailable", "Could not upload the audio to storage. Try again.");
  }

  let transcribeError: string | undefined;
  let pieceText = "";
  if (transcribeOutcome.status === "rejected") {
    const err = transcribeOutcome.reason;
    transcribeError = err instanceof HttpError ? err.message : "Transcription failed. Try again.";
  } else {
    const result = transcribeOutcome.value;
    const formatted = speakers
      ? formatSpeakerSegments(result.segments ?? (result.text ? [{ speaker: "?", text: result.text }] : []))
      : result.text.trim();
    pieceText = settings.autoReplacements && replacements.length ? applyReplacements(formatted, replacements).text : formatted;
    if (!pieceText) {
      transcribeError = "No speech was detected in the audio.";
    }
  }

  const now = Date.now();
  const isRecording = source === "recording" || source === "meeting";

  try {
    if (existingNote) {
      const noteId = Number(existingNote.id);
      const audioFile = await insertAudioFile(user.id, noteId, {
        fileName: storageName,
        mime: safeMime,
        size: audio.size,
        durationSec,
        originalName,
        prepared: !isRecording,
        status: transcribeError ? "pending" : "ready",
        transcript: transcribeError ? null : pieceText,
      });

      const fullTranscript = transcribeError
        ? existingNote.transcript
        : joinTranscriptParts([existingNote.transcript, pieceText], "\n\n");
      const existingTitle = existingNote.title.trim();
      const initialTitle = existingTitle || (transcribeError ? "" : fallbackTitle(fullTranscript));
      const titlePending = !transcribeError && !existingTitle && settings.autoTitle;

      assertOk(
        await owned(user.id, "notes")
          .update({
            transcript: fullTranscript,
            ...(initialTitle && !existingTitle ? { title: initialTitle } : {}),
            status: transcribeError ? "failed" : "ready",
            stage: null,
            progress: null,
            error: transcribeError ?? null,
            language: language === "auto" ? existingNote.language : language,
            speakers,
            updated_at: now,
          })
          .eq("id", noteId),
      );

      const note = (await getNote(user.id, noteId))!;
      after(async () => {
        const bg: Array<Promise<unknown>> = [];
        if (isRecording) bg.push(remuxInBackground(audioFile.id, storageName, extension, audio));
        if (!transcribeError) {
          bg.push(
            (async () => {
              if (titlePending) {
                const aiTitle = await generateTitle(fullTranscript, settings.rewriteModel);
                if (aiTitle && aiTitle !== initialTitle) {
                  await owned(user.id, "notes").update({ title: aiTitle }).eq("id", noteId).eq("title", initialTitle);
                }
              }
              await triggerAutomaticActions(user.id, "transcript", noteId, null);
            })(),
          );
        }
        await Promise.allSettled(bg);
      });

      return json({ note, titlePending, ...(transcribeError ? { transcribeError } : {}) });
    }

    // New note fast path: write note + audio row and build Note response directly (avoids 7 extra read queries).
    const initialTitle = transcribeError ? "" : fallbackTitle(pieceText);
    const titlePending = !transcribeError && settings.autoTitle;

    const inserted = assertOk(
      await owned(user.id, "notes")
        .insert({
          title: initialTitle,
          transcript: transcribeError ? "" : pieceText,
          status: transcribeError ? "failed" : "ready",
          stage: null,
          progress: null,
          error: transcribeError ?? null,
          source,
          language,
          speakers,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single(),
    ) as { id: number };
    const noteId = Number(inserted.id);

    const audioRow = assertOk(
      await supabase()
        .from("audio_files")
        .insert({
          note_id: noteId,
          file_name: storageName,
          mime: safeMime,
          size: audio.size,
          duration_sec: durationSec,
          original_name: originalName,
          position: 0,
          prepared: !isRecording,
          status: transcribeError ? "pending" : "ready",
          transcript: transcribeError ? null : pieceText,
          uploaded: true,
          created_at: now,
        })
        .select("*")
        .single(),
    ) as {
      id: number;
      note_id: number;
      mime: string;
      size: number;
      duration_sec: number | null;
      original_name: string | null;
      position: number;
      status: "pending" | "ready" | "failed";
      created_at: number;
    };

    const audioFile: AudioFile = {
      id: Number(audioRow.id),
      noteId,
      mime: audioRow.mime,
      size: Number(audioRow.size),
      durationSec: audioRow.duration_sec,
      originalName: audioRow.original_name,
      position: audioRow.position,
      status: audioRow.status,
      createdAt: Number(audioRow.created_at),
    };

    const note: Note = {
      id: noteId,
      title: initialTitle,
      transcript: transcribeError ? "" : pieceText,
      status: transcribeError ? "failed" : "ready",
      stage: null,
      progress: null,
      error: transcribeError ?? null,
      source,
      language,
      speakers,
      archived: false,
      durationSec,
      tags: [],
      audioFiles: [audioFile],
      rewrites: [],
      createdAt: now,
      updatedAt: now,
    };

    after(async () => {
      const bg: Array<Promise<unknown>> = [];
      if (isRecording) bg.push(remuxInBackground(audioFile.id, storageName, extension, audio));
      if (!transcribeError) {
        bg.push(
          (async () => {
            if (titlePending) {
              const aiTitle = await generateTitle(pieceText, settings.rewriteModel);
              if (aiTitle && aiTitle !== initialTitle) {
                await owned(user.id, "notes").update({ title: aiTitle }).eq("id", noteId).eq("title", initialTitle);
              }
            }
            await triggerAutomaticActions(user.id, "transcript", noteId, null);
          })(),
        );
        if (settings.autoRewritePromptId) {
          bg.push(
            prepareRewrite(user.id, noteId, { promptId: settings.autoRewritePromptId })
              .then((prepared) => prepared.run())
              .catch((err) => console.warn("Background auto-rewrite failed:", err)),
          );
        }
      }
      await Promise.allSettled(bg);
    });

    return json({ note, titlePending, ...(transcribeError ? { transcribeError } : {}) }, { status: 201 });
  } catch (dbError) {
    await deleteAudioObject(storageName);
    throw dbError;
  }
});
