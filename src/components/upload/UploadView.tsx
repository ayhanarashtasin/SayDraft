"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileAudio, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { formatBytes, formatDuration } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { CONVERTIBLE_EXTENSIONS, DEFAULT_UPLOAD_MAX_MB, DIRECT_AUDIO_EXTENSIONS, extensionFromName } from "@/lib/limits";
import { SPRING_SMOOTH, SPRING_SNAPPY } from "@/lib/motion";
import type { Note } from "@/lib/types";
import { uploadAudioNote } from "../record/upload-flow";
import { useAppStatus } from "../StatusProvider";
import { useToast } from "../Toast";
import { ProgressBar, Spinner, Switch } from "../ui";

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
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-4 sm:px-6">
      <div className="pt-1">
        <Link
          href={appendTo ? `/notes/${appendTo}` : "/"}
          className="frosted-topbar inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[var(--ink)] transition-opacity hover:opacity-65"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="py-8"
      >
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--ink)]">
          {appendTo ? "Add audio to a note" : "Upload audio or video"}
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-[var(--ink-muted)]">
          {appendNote
            ? `The transcript will be added to the end of "${appendNote.title || "Untitled note"}".`
            : "We'll transcribe your recording and turn it into a note automatically."}
        </p>

        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Choose a file to upload"
          animate={{ scale: dragging ? 1.015 : 1 }}
          whileTap={!uploading ? { scale: 0.99 } : undefined}
          transition={SPRING_SNAPPY}
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
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploading) choose(event.dataTransfer.files?.[0]);
          }}
          className={`surface-card mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-16 text-center transition-[background-color,border-color] duration-200 ${
            dragging ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-hover)]"
          }`}
        >
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
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            <Upload className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-[var(--ink)]">Drop a file here, or click to browse</p>
          <p className="mt-1 max-w-sm text-xs text-[var(--ink-muted)]">
            {extendedFormats
              ? `Supports MP3, M4A, WAV, WebM, OGG, FLAC, AAC, MP4, MOV & MKV up to ${formatBytes(maxBytes)}`
              : `Supports MP3, M4A, WAV, WebM, OGG, FLAC, or MP4 up to ${formatBytes(maxBytes)}`}
          </p>
        </motion.div>

        <AnimatePresence initial={false}>
          {file && previewUrl && (
            <motion.div
              key={`${file.name}-${file.size}`}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={SPRING_SMOOTH}
              className="surface-card mt-5 space-y-4 rounded-[1.75rem] p-5"
            >
              <div className="flex items-center gap-3">
                <FileAudio className="h-5 w-5 shrink-0 text-[var(--brand)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{file.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {formatBytes(file.size)}
                    {durationSec ? ` · ${formatDuration(durationSec)}` : ""}
                  </p>
                </div>
                {!uploading && (
                  <button type="button" className="icon-btn" aria-label="Remove file" onClick={() => setFile(null)}>
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
                <label className="flex flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-xs font-medium text-[var(--ink-muted)]">
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
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-3">
                    <Switch checked={speakers} onChange={setSpeakers} disabled={uploading} label="Multi-speaker" description="Label who said what" />
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
                <div className="flex justify-end">
                  <button type="button" className="btn btn-primary" onClick={() => void submit()}>
                    {appendTo ? "Add and transcribe" : "Transcribe file"}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div role="alert" className="alert alert-error mt-4">
            {error}
          </div>
        )}
      </motion.main>
    </div>
  );
}
