"use client";

import { Upload } from "tus-js-client";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { DIRECT_AUDIO_EXTENSIONS, DIRECT_TRANSCRIBE_MAX_SEC, QUICK_AUDIO_MAX_BYTES, audioExtension } from "@/lib/limits";
import type { AudioFile, Note, NoteSource } from "@/lib/types";

interface StashedNote {
  note: Note;
  titlePending: boolean;
  ts: number;
}

const readyNotes = new Map<number, StashedNote>();

export function stashReadyNote(note: Note, titlePending: boolean): void {
  readyNotes.set(note.id, { note, titlePending, ts: Date.now() });
}

export function consumeReadyNote(noteId: number): { note: Note; titlePending: boolean } | null {
  const entry = readyNotes.get(noteId);
  readyNotes.delete(noteId);
  if (!entry || Date.now() - entry.ts > 30_000) return null;
  return { note: entry.note, titlePending: entry.titlePending };
}

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

function canUseQuickPath(params: UploadParams): boolean {
  if (params.files.length !== 1) return false;
  const [file] = params.files;
  if (file.blob.size <= 0 || file.blob.size > QUICK_AUDIO_MAX_BYTES) return false;
  if (file.durationSec !== null && file.durationSec > DIRECT_TRANSCRIBE_MAX_SEC) return false;
  const ext = audioExtension(file.blob.type, file.name);
  return Boolean(ext && DIRECT_AUDIO_EXTENSIONS.has(ext));
}

function quickUpload(params: UploadParams): Promise<UploadResult | null> {
  params.signal?.throwIfAborted();
  const [file] = params.files;
  const form = new FormData();
  form.set("file", file.blob, file.name.slice(0, 200));
  form.set("name", file.name.slice(0, 200));
  form.set("source", params.source);
  form.set("language", params.language);
  form.set("speakers", String(params.speakers));
  if (file.durationSec !== null && Number.isFinite(file.durationSec) && file.durationSec > 0) {
    form.set("durationSec", String(file.durationSec));
  }
  if (params.appendTo !== null) {
    form.set("appendTo", String(params.appendTo));
  }

  return new Promise<UploadResult | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/notes/quick");
    xhr.responseType = "text";

    const abort = () => {
      xhr.abort();
      reject(params.signal?.reason ?? new DOMException("Upload cancelled", "AbortError"));
    };
    params.signal?.addEventListener("abort", abort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        params.onProgress?.(Math.min(0.72, (event.loaded / event.total) * 0.72));
      }
    };
    xhr.upload.onload = () => {
      params.onProgress?.(0.85);
    };

    xhr.onerror = () => {
      params.signal?.removeEventListener("abort", abort);
      reject(new ApiError(0, "upload_failed", "Could not upload the audio. Try again."));
    };

    xhr.onload = () => {
      params.signal?.removeEventListener("abort", abort);
      let body: { note?: Note; titlePending?: boolean; transcribeError?: string; error?: { code?: string; message?: string } } | null = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status === 401) {
        if (typeof window !== "undefined") {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        }
        reject(new ApiError(401, "unauthenticated", "Sign in to continue."));
        return;
      }
      // Fall back to the resumable multi-step path if this file exceeds the quick-path cap, format, or AI key check.
      if (xhr.status === 413 || xhr.status === 415 || xhr.status === 503) {
        resolve(null);
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.note) {
        params.onProgress?.(1);
        stashReadyNote(body.note, Boolean(body.titlePending));
        resolve({ noteId: body.note.id, transcribeError: body.transcribeError });
        return;
      }
      reject(
        new ApiError(
          xhr.status || 500,
          body?.error?.code ?? "upload_failed",
          body?.error?.message ?? "Could not process the recording. Try again.",
        ),
      );
    };

    xhr.send(form);
  });
}

/**
 * Creates (or reuses) a note, uploads each audio file with progress, then starts
 * transcription. Short direct-format clips use the single-request `/api/notes/quick`
 * fast path; larger or multi-segment audio falls back to resumable TUS + workflow.
 */
export async function uploadAudioNote(params: UploadParams): Promise<UploadResult> {
  const { appendTo, files } = params;
  if (files.length === 0) throw new ApiError(400, "no_audio", "There is no audio to upload.");

  if (canUseQuickPath(params)) {
    const quick = await quickUpload(params);
    if (quick) return quick;
  }

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
