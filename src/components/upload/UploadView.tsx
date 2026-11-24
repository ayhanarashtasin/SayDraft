"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileAudio, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { formatBytes, formatDuration } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { CONVERTIBLE_EXTENSIONS, DEFAULT_UPLOAD_MAX_MB, DIRECT_AUDIO_EXTENSIONS, extensionFromName } from "@/lib/limits";
import type { Note } from "@/lib/types";
import { BackArrowIcon, UploadTrayBoxIcon } from "../icons";
import { uploadAudioNote } from "../record/upload-flow";
import { useAppStatus } from "../StatusProvider";
import { useToast } from "../Toast";
import { ProgressBar, Spinner, Switch } from "../ui";

/** Full-bleed dashed dropzone matching Letterly's /record/upload page. */
export function UploadView() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { status } = useAppStatus();
  const appendTo = Number(params.get("append")) > 0 ? Number(params.get("append")) : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [language, setLanguage] = useState("auto");
  const [speakers, setSpeakers] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [appendNote, setAppendNote] = useState<Note | null>(null);

  const extendedFormats = status?.ffmpeg ?? true;
  const maxBytes = status?.limits.maxUploadBytes ?? DEFAULT_UPLOAD_MAX_MB * 1024 * 1024;
  const allowed = extendedFormats ? CONVERTIBLE_EXTENSIONS : DIRECT_AUDIO_EXTENSIONS;

  useEffect(() => {
    if (status && !appendTo) setLanguage(status.settings.defaultLanguage || "auto");
  }, [status, appendTo]);
  useEffect(() => {
    if (!appendTo) return;
    api<{ note: Note }>(`/api/notes/${appendTo}`)
      .then(({ note }) => {
        setAppendNote(note);
        setLanguage(note.language || "auto");
        setSpeakers(note.speakers);
      })
      .catch(() => setError("We couldn't find the note you want to add to."));
  }, [appendTo]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function choose(candidate: File | null | undefined) {
    if (!candidate) return;
    setError(null);
    const extension = extensionFromName(candidate.name);
    const isMedia = candidate.type.startsWith("audio/") || candidate.type.startsWith("video/");
    if (!isMedia && !(extension && allowed.has(extension))) {
      setError("Please choose an audio or video file (MP3, M4A, WAV, WebM, OGG, FLAC, or MP4).");
      return;
    }
    if (status && candidate.size > maxBytes) {
      setError(`This file is ${formatBytes(candidate.size)}, which is larger than the ${formatBytes(maxBytes)} limit.`);
      return;
    }
    setFile(candidate);
    setDurationSec(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(candidate);
    });
  }

  async function submit() {
    if (!file || uploading) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    abortRef.current = new AbortController();
    try {
      const result = await uploadAudioNote({
        appendTo,
        source: "upload",
        language,
        speakers,
        files: [{ blob: file, name: file.name, durationSec }],
        onProgress: setProgress,
        signal: abortRef.current.signal,
      });
      if (result.transcribeError) toast(result.transcribeError, "error");
      router.push(`/notes/${result.noteId}`);
    } catch (uploadError) {
      if (uploadError instanceof DOMException && uploadError.name === "AbortError") setError("Upload cancelled.");
      else setError(errorMessage(uploadError));
      setUploading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--canvas)]">
      <header className="sticky top-0 z-20 flex min-h-[3.875rem] w-full items-center justify-between border-b border-[var(--border)]/70 bg-[var(--canvas)]/90 px-5 backdrop-blur-md">
        <Link
          href={appendTo ? `/notes/${appendTo}` : "/"}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
        >
          <BackArrowIcon className="h-5 w-5" />
        </Link>
        {appendNote && (
          <p className="text-xs font-medium text-[var(--ink-muted)]">
            Adding to <span className="font-semibold text-[var(--ink)]">{appendNote.title || "Untitled note"}</span>
          </p>
        )}
        <span className="w-9" />
      </header>

      <main className="flex flex-1 flex-col p-6 sm:p-12">
        <input
          ref={inputRef}
          type="file"
          accept={`audio/*,video/*,${[...allowed].map((extension) => `.${extension}`).join(",")}`}
          className="hidden"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {!file || !previewUrl ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a file to upload"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!uploading) choose(event.dataTransfer.files?.[0]);
            }}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border border-dashed p-8 text-center transition-colors duration-150 ${
              dragging ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--ash-500)] hover:bg-[var(--surface-panel)]/35"
            }`}
          >
            <UploadTrayBoxIcon className="h-6 w-6 text-[var(--ink)]" />
            <p className="mt-4 text-[1.0625rem] font-medium tracking-tight text-[var(--ink)]">
              Drag and drop a file to upload it
            </p>
            <p className="mt-1.5 max-w-md text-xs text-[var(--ink-muted)] sm:text-sm">
              {extendedFormats
                ? `Supported: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac, mov (up to ${formatBytes(maxBytes)})`
                : `Supported: mp3, mp4, mpeg, mpga, m4a, wav, webm (up to ${formatBytes(maxBytes)})`}
            </p>
            {error && (
              <p role="alert" className="alert alert-error mt-6 max-w-md">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-[var(--ash-500)] p-6">
            <div className="w-full max-w-md space-y-4 rounded-[2rem] bg-[var(--surface-panel)] p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <FileAudio className="h-5 w-5 shrink-0 text-[var(--brand)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{file.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {formatBytes(file.size)}
                    {durationSec ? ` · ${formatDuration(durationSec)}` : ""}
                  </p>
                </div>
                {!uploading && (
                  <button type="button" className="circle-close h-8 w-8" aria-label="Remove file" onClick={() => setFile(null)}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <audio
                controls
                preload="metadata"
                src={previewUrl}
                onLoadedMetadata={(event) => {
                  const value = event.currentTarget.duration;
                  if (Number.isFinite(value) && value > 0) setDurationSec(value);
                }}
                className="w-full"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 rounded-2xl bg-[var(--surface-panel-card)] px-3.5 py-2.5 text-xs font-medium text-[var(--ink-muted)]">
                  Speaker&apos;s language
                  <select
                    value={language}
                    disabled={uploading}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="cursor-pointer bg-transparent text-sm font-semibold text-[var(--ink)] outline-none"
                  >
                    <option value="auto">Auto-detect</option>
                    {LANGUAGES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name} · {item.native}
                      </option>
                    ))}
                  </select>
                </label>
                {status?.speakersAvailable && (
                  <div className="flex items-center rounded-2xl bg-[var(--surface-panel-card)] px-3.5 py-3">
                    <Switch checked={speakers} onChange={setSpeakers} disabled={uploading} label="Multi-speaker" />
                  </div>
                )}
              </div>

              {uploading ? (
                <div className="space-y-2">
                  <ProgressBar value={progress} label="Upload progress" />
                  <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Spinner className="h-3 w-3" /> {progress < 1 ? `Uploading · ${Math.round(progress * 100)}%` : "Starting transcription…"}
                    </span>
                    {progress < 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => abortRef.current?.abort()}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
                    Change file
                  </button>
                  <button type="button" className="btn btn-purple" onClick={() => void submit()}>
                    {appendTo ? "Add and transcribe" : "Transcribe file"}
                  </button>
                </div>
              )}

              {error && (
                <div role="alert" className="alert alert-error">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
