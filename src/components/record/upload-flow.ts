"use client";

import { Upload } from "tus-js-client";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import type { AudioFile, Note, NoteSource } from "@/lib/types";

export interface UploadFile {
  blob: Blob;
  name: string;
  durationSec: number | null;
}

export interface UploadParams {
  /** Add the audio to this existing note instead of creating a new one. */
  appendTo: number | null;
  source: Extract<NoteSource, "recording" | "meeting" | "upload">;
  language: string;
  speakers: boolean;
  files: UploadFile[];
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  noteId: number;
  /** Set when the audio was saved but transcription could not start (for example, no API key). */
  transcribeError?: string;
}

interface AudioUpload {
  audioId: number;
  endpoint: string;
  token: string;
  bucketName: string;
  objectName: string;
  contentType: string;
}

function uploadToStorage(file: Blob, reservation: AudioUpload, onProgress: (sent: number) => void, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: reservation.endpoint,
      headers: { "x-signature": reservation.token },
      metadata: {
        bucketName: reservation.bucketName,
        objectName: reservation.objectName,
        contentType: reservation.contentType,
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      storeFingerprintForResuming: false,
      onProgress,
      onSuccess() {
        signal?.removeEventListener("abort", abort);
        resolve();
      },
      onError() {
        signal?.removeEventListener("abort", abort);
        reject(new ApiError(0, "upload_failed", "Could not upload the audio to storage. Try again."));
      },
    });
    const abort = () => {
      void upload.abort().catch(() => undefined);
      reject(signal?.reason ?? new DOMException("Upload cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    upload.start();
  });
}

/**
 * Creates (or reuses) a note, uploads each audio file with progress, then starts
 * transcription. If an upload fails, the partial note or files are removed again.
 */
export async function uploadAudioNote(params: UploadParams): Promise<UploadResult> {
  const { appendTo, files } = params;
  if (files.length === 0) throw new ApiError(400, "no_audio", "There is no audio to upload.");
  const noteId =
    appendTo ??
    (
      await api<{ note: Note }>("/api/notes", {
        json: { kind: "audio", source: params.source, language: params.language, speakers: params.speakers },
        signal: params.signal,
      })
    ).note.id;

  const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0) || 1;
  let sentBytes = 0;
  const uploaded: number[] = [];
  try {
    for (const file of files) {
      const { upload } = await api<{ upload: AudioUpload }>(`/api/notes/${noteId}/audio`, {
        json: { name: file.name.slice(0, 200), type: file.blob.type, size: file.blob.size, durationSec: file.durationSec },
        signal: params.signal,
      });
      uploaded.push(upload.audioId);
      await uploadToStorage(file.blob, upload, (sent) => params.onProgress?.((sentBytes + sent) / totalBytes), params.signal);
      await api<{ audioFile: AudioFile }>(`/api/notes/${noteId}/audio/${upload.audioId}`, { method: "POST", signal: params.signal });
      sentBytes += file.blob.size;
    }
  } catch (error) {
    // Undo the partial upload; the recording itself is still kept in the browser.
    if (appendTo === null) {
      await api(`/api/notes/${noteId}`, { method: "DELETE" }).catch(() => undefined);
    } else {
      for (const id of uploaded) await api(`/api/notes/${noteId}/audio/${id}`, { method: "DELETE" }).catch(() => undefined);
    }
    throw error;
  }

  try {
    await api(`/api/notes/${noteId}/transcribe`, {
      json: { mode: "pending", language: params.language, speakers: params.speakers },
    });
    return { noteId };
  } catch (error) {
    return { noteId, transcribeError: errorMessage(error) };
  }
}

export function extensionForType(type: string): string {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
