import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FatalError } from "workflow";
import { DIRECT_AUDIO_EXTENSIONS, DIRECT_TRANSCRIBE_MAX_BYTES } from "../lib/limits.ts";
import { applyReplacements, cleanTitle, fallbackTitle, joinTranscriptParts } from "../lib/text.ts";
import { AudioToolError, convertToM4a, extractAudioPiece, hasFfmpeg, probeAudio, remuxAudio } from "./audio.ts";
import { HttpError, badRequest, notFound } from "./http.ts";
import { triggerAutomaticActions } from "./integrations.ts";
import { type NoteRow, getAudioRow, getNoteRow, getNoteRowForJob, listAudioRows, recoverExpiredWork } from "./notes.ts";
import { aiConfig, chat, transcribe } from "./openai.ts";
import { prepareRewrite } from "./rewrite.ts";
import { getSettings } from "./settings.ts";
import { assertOk, assertWorkspaceWrite, createAudioSignedUrl, deleteAudioObject, downloadAudioToFile, supabase, tempDir, uploadAudioObject } from "./supabase.ts";
import { dictionaryPrompt, listReplacements } from "./vocab.ts";

export interface TranscribeOptions {
  mode: "pending" | "all";
  language?: string;
  speakers?: boolean;
}

export interface TranscriptionJob {
  noteId: number;
  jobId: string;
  mode: TranscribeOptions["mode"];
}

export interface PreparedAudio {
  id: number;
  fileName: string;
  mime: string;
  size: number;
  duration: number | null;
}

export interface TranscriptionPlan {
  fileIds: number[];
  isRecording: boolean;
  speakers: boolean;
  ffmpeg: boolean;
  model: string;
  language?: string;
  prompt?: string;
  autoRewritePromptId: number | null;
}

export interface AudioPiece {
  file: PreparedAudio;
  startSec?: number;
  lengthSec?: number;
}

const WORK_LEASE_MS = 30 * 60_000;
const STEP_TIMEOUT_MS = 270_000;

export async function claimTranscription(userId: string, noteId: number, options: TranscribeOptions): Promise<TranscriptionJob> {
  if (!aiConfig().configured) throw new HttpError(503, "key_missing", "AI transcription is not configured on the server yet.");
  await recoverExpiredWork(noteId);
  const note = await getNoteRow(userId, noteId);
  if (!note) throw notFound("Note not found.");
  const speakers = options.speakers ?? Boolean(note.speakers);
  if (speakers && !(await getSettings(userId)).diarizeModel) {
    throw badRequest("Speaker separation is turned off. Choose a speaker separation model in Settings → Preferences.");
  }
  const now = Date.now();
  const jobId = crypto.randomUUID();
  assertWorkspaceWrite(await supabase().rpc("claim_note_transcription", {
    p_note_id: noteId,
    p_job_id: jobId,
    p_mode: options.mode,
    p_language: options.language ?? note.language,
    p_speakers: speakers,
    p_now: now,
    p_deadline: now + WORK_LEASE_MS,
  }));
  return { noteId, jobId, mode: options.mode };
}

async function renewJob(job: TranscriptionJob, stage?: string, progress?: number): Promise<NoteRow> {
  const current = assertOk(await supabase().from("notes")
    .update({ stage, progress, transcription_deadline: Date.now() + WORK_LEASE_MS })
    .eq("id", job.noteId).eq("transcription_id", job.jobId).eq("status", "processing")
    .select("*").maybeSingle()) as NoteRow | null;
  if (!current) throw new FatalError("This transcription is no longer active.");
  return current;
}

export async function markTranscriptionFailed(job: TranscriptionJob, message: string): Promise<void> {
  assertOk(await supabase().from("notes").update({
    status: "failed", stage: null, progress: null, error: message, transcription_deadline: null, updated_at: Date.now(),
  }).eq("id", job.noteId).eq("transcription_id", job.jobId).eq("status", "processing"));
}

export async function failTranscription(job: TranscriptionJob, message: string): Promise<void> {
  "use step";
  await markTranscriptionFailed(job, message);
}

export async function loadTranscriptionPlan(job: TranscriptionJob): Promise<TranscriptionPlan> {
  "use step";
  const note = await renewJob(job, "Preparing audio", 0);
  // The owner comes from the note's own row, never from the job input.
  const [settings, files] = await Promise.all([getSettings(note.user_id), listAudioRows(note.user_id, job.noteId)]);
  const fileIds = files.filter((file) => job.mode === "all" || file.status !== "ready").map((file) => Number(file.id));
  if (!fileIds.length) throw new FatalError("There is no audio to transcribe.");
  const language = note.language || settings.defaultLanguage;
  return {
    fileIds,
    speakers: note.speakers,
    isRecording: note.source === "recording" || note.source === "meeting",
    ffmpeg: hasFfmpeg(),
    model: note.speakers ? settings.diarizeModel : settings.transcribeModel,
    language: language === "auto" ? undefined : language,
    prompt: !note.speakers && settings.useDictionary ? await dictionaryPrompt(note.user_id) : undefined,
    autoRewritePromptId: !note.transcript.trim() ? settings.autoRewritePromptId : null,
  };
}

async function signedAudio(name: string): Promise<string> {
  const url = await createAudioSignedUrl(name);
  if (!url) throw new FatalError("An audio file for this note could not be found in storage.");
  return url;
}

export async function prepareAudio(
  job: TranscriptionJob, plan: TranscriptionPlan, index: number,
): Promise<PreparedAudio> {
  "use step";
  const note = await renewJob(job, plan.fileIds.length > 1 ? `Preparing audio (${index + 1} of ${plan.fileIds.length})` : "Preparing audio", 0);
  const id = plan.fileIds[index];
  const row = await getAudioRow(note.user_id, job.noteId, id);
  if (!row) throw new FatalError("An audio file was removed before transcription.");
  const original = { id, fileName: row.file_name, mime: row.mime, size: Number(row.size), duration: row.duration_sec };
  const extension = path.extname(row.file_name).slice(1);
  if (!plan.ffmpeg) {
    if (!DIRECT_AUDIO_EXTENSIONS.has(extension) || original.size > DIRECT_TRANSCRIBE_MAX_BYTES) {
      throw new FatalError("This audio requires ffmpeg to convert or split it.");
    }
    return original;
  }
  if (row.prepared && original.duration !== null) return original;

  const signal = AbortSignal.timeout(STEP_TIMEOUT_MS);
  const workDir = fs.mkdtempSync(path.join(tempDir(), "prepare-"));
  try {
    // Large files are read with HTTP Range requests so the original fits outside /tmp.
    let input: string;
    if (original.size > DIRECT_TRANSCRIBE_MAX_BYTES) {
      input = await signedAudio(row.file_name);
    } else {
      input = path.join(workDir, path.basename(row.file_name));
      if (!(await downloadAudioToFile(row.file_name, input, signal))) throw new FatalError("An audio file is missing from storage.");
    }

    const repair = plan.isRecording && ["webm", "ogg", "m4a", "mp4"].includes(extension);
    const outputName = `${job.jobId}-${id}.${repair ? extension : "m4a"}`;
    const output = path.join(workDir, outputName);
    let media = input;
    if (!row.prepared) {
      if (repair) {
        try {
          await remuxAudio(input, output, signal);
          media = output;
        } catch (error) {
          if (signal.aborted) throw error;
        }
      } else {
        await convertToM4a(input, output, signal);
        media = output;
      }
    }
    const probe = await probeAudio(media, signal);
    if (!probe.hasAudio) throw new FatalError("This file has no readable audio track.");
    if (probe.durationSec === null) throw new FatalError("The audio length could not be read. Try exporting it as MP3 or M4A and uploading again.");
    const converted = media === output;
    const prepared = {
      id,
      fileName: converted ? outputName : original.fileName,
      mime: converted && !repair ? "audio/mp4" : original.mime,
      size: converted ? fs.statSync(output).size : original.size,
      duration: probe.durationSec,
    };
    if (converted) await uploadAudioObject(outputName, await fs.openAsBlob(output, { type: prepared.mime }), prepared.mime);
    const updated = assertOk(await supabase().rpc("store_prepared_audio", {
      p_note_id: job.noteId, p_job_id: job.jobId, p_file_id: id, p_old_name: row.file_name,
      p_new_name: prepared.fileName, p_mime: prepared.mime, p_duration: prepared.duration, p_size: prepared.size,
    }));
    if (!updated) {
      if (converted) await deleteAudioObject(outputName);
      throw new FatalError("This transcription is no longer active.");
    }
    if (converted) await deleteAudioObject(row.file_name);
    return prepared;
  } catch (error) {
    if (error instanceof AudioToolError) throw new FatalError(error.message);
    throw error;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export async function updateTranscriptionProgress(job: TranscriptionJob, done: number, total: number): Promise<void> {
  "use step";
  const stage = total > 1 ? `Transcribing (${done} of ${total} parts)` : "Transcribing";
  await renewJob(job, stage, done / total);
}

export async function transcribeAudioPiece(job: TranscriptionJob, plan: TranscriptionPlan, piece: AudioPiece) {
  "use step";
  await renewJob(job);
  const signal = AbortSignal.timeout(STEP_TIMEOUT_MS);
  const workDir = fs.mkdtempSync(path.join(tempDir(), "piece-"));
  try {
    const { file, startSec, lengthSec } = piece;
    const split = startSec !== undefined && lengthSec !== undefined;
    const name = split ? "part.mp3" : `audio${path.extname(file.fileName)}`;
    const local = path.join(workDir, name);
    if (split) {
      await extractAudioPiece(await signedAudio(file.fileName), local, startSec, lengthSec, signal);
    } else if (!(await downloadAudioToFile(file.fileName, local, signal))) {
      throw new FatalError("An audio file is missing from storage.");
    }
    return await transcribe({
      filePath: local, fileName: name, mime: split ? "audio/mpeg" : file.mime,
      model: plan.model, language: plan.language, prompt: plan.prompt, diarize: plan.speakers, signal,
    });
  } catch (error) {
    if (error instanceof HttpError || error instanceof AudioToolError) throw new FatalError(error.message);
    throw error;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function generateTitle(text: string, model: string): Promise<string> {
  try {
    const raw = await chat({
      model,
      system: "Write a short, specific title (2 to 7 words) for this note, in the same language as the note. Reply with the title only, without quotes or a trailing period.",
      user: text.slice(0, 6000),
      signal: AbortSignal.timeout(20_000),
    });
    return cleanTitle(raw) || fallbackTitle(text);
  } catch {
    return fallbackTitle(text);
  }
}

export async function titleForText(userId: string, text: string): Promise<string> {
  const settings = await getSettings(userId);
  if (!settings.autoTitle || !aiConfig().configured) return fallbackTitle(text);
  return generateTitle(text, settings.rewriteModel);
}

export async function saveTranscription(job: TranscriptionJob, fileTexts: Array<{ id: number; text: string }>) {
  "use step";
  const current = await getNoteRowForJob(job.noteId);
  if (!current || current.transcription_id !== job.jobId || current.status === "failed") return false;
  if (current.status === "ready") return true;
  const settings = await getSettings(current.user_id);
  const replacements = settings.autoReplacements ? await listReplacements(current.user_id) : [];
  const files = fileTexts.map(({ id, text }) => ({ id, text: replacements.length ? applyReplacements(text, replacements).text : text }));
  const newText = joinTranscriptParts(files.map((file) => file.text), "\n\n");
  if (!newText) throw new FatalError("No speech was detected in the audio.");
  const transcript = job.mode === "all" ? newText : joinTranscriptParts([current.transcript, newText], "\n\n");
  let title: string | null = null;
  if (!current.title.trim()) {
    await renewJob(job, "Writing a title", 1);
    title = settings.autoTitle ? await generateTitle(transcript, settings.rewriteModel) : fallbackTitle(transcript);
  }
  return Boolean(assertOk(await supabase().rpc("finish_note_transcription", {
    p_note_id: job.noteId, p_job_id: job.jobId, p_transcript: transcript, p_title: title, p_files: files, p_now: Date.now(),
  })));
}

export async function sendTranscriptActions(job: TranscriptionJob): Promise<void> {
  "use step";
  const note = await getNoteRowForJob(job.noteId);
  if (!note) return;
  await triggerAutomaticActions(note.user_id, "transcript", job.noteId, null);
}
// Sending a third-party webhook or creating a Notion page can have side effects.
sendTranscriptActions.maxRetries = 0;

export async function autoRewriteTranscription(job: TranscriptionJob, promptId: number): Promise<void> {
  "use step";
  const note = await getNoteRowForJob(job.noteId);
  if (!note) return;
  const prepared = await prepareRewrite(note.user_id, job.noteId, { promptId });
  await prepared.run();
}
autoRewriteTranscription.maxRetries = 0;
