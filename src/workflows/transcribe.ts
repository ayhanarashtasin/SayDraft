import { FatalError } from "workflow";
import { DIARIZE_CHUNK_SEC, DIRECT_TRANSCRIBE_MAX_BYTES, DIRECT_TRANSCRIBE_MAX_SEC, TRANSCRIBE_CHUNK_SEC } from "../lib/limits.ts";
import { formatSpeakerSegments, joinTranscriptParts } from "../lib/text.ts";
import {
  type AudioPiece,
  type TranscriptionJob,
  autoRewriteTranscription,
  failTranscription,
  loadTranscriptionPlan,
  prepareAudio,
  saveTranscription,
  sendTranscriptActions,
  transcribeAudioPiece,
  updateTranscriptionProgress,
} from "../server/pipeline.ts";

export async function transcribeNote(job: TranscriptionJob): Promise<void> {
  "use workflow";
  let autoRewritePromptId: number | null;
  try {
    const plan = await loadTranscriptionPlan(job);
    const parts: AudioPiece[] = [];
    const chunkSec = plan.speakers ? DIARIZE_CHUNK_SEC : TRANSCRIBE_CHUNK_SEC;
    for (let index = 0; index < plan.fileIds.length; index += 1) {
      const file = await prepareAudio(job, plan, index);
      const duration = file.duration ?? 0;
      if (!plan.ffmpeg || (file.size <= DIRECT_TRANSCRIBE_MAX_BYTES && duration <= DIRECT_TRANSCRIBE_MAX_SEC)) {
        parts.push({ file });
      } else {
        // Discard trailing container padding of less than a fifth of a second.
        const chunks = Math.max(1, Math.ceil((duration - 0.2) / chunkSec));
        for (let part = 0; part < chunks; part += 1) {
          parts.push({ file, startSec: part * chunkSec, lengthSec: chunkSec });
        }
      }
    }

    const byFile = new Map<number, Awaited<ReturnType<typeof transcribeAudioPiece>>[]>();
    for (let offset = 0; offset < parts.length; offset += 3) {
      await updateTranscriptionProgress(job, offset, parts.length);
      const batch = parts.slice(offset, offset + 3);
      const results = await Promise.all(batch.map((part) => transcribeAudioPiece(job, plan, part)));
      for (const [index, result] of results.entries()) {
        const id = batch[index].file.id;
        const fileResults = byFile.get(id) ?? [];
        fileResults.push(result);
        byFile.set(id, fileResults);
      }
    }

    const files = [...byFile].map(([id, results]) => ({
      id,
      text: plan.speakers
        ? formatSpeakerSegments(results.flatMap((part) => part.segments ?? (part.text ? [{ speaker: "?", text: part.text }] : [])))
        : joinTranscriptParts(results.map((part) => part.text)),
    }));
    const saved = await saveTranscription(job, files);
    if (!saved) return;
    autoRewritePromptId = plan.autoRewritePromptId;
  } catch (error) {
    await failTranscription(job, error instanceof FatalError ? error.message : "Transcription was interrupted. Try again.");
    return;
  }

  const actions = [sendTranscriptActions(job)];
  if (autoRewritePromptId) actions.push(autoRewriteTranscription(job, autoRewritePromptId));
  await Promise.allSettled(actions);
}
