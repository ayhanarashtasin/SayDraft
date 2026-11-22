"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Mic, MonitorSpeaker, Pause, Play, RotateCcw, Square, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { MAX_RECORDING_SEC, RECORDING_BITRATE, RECORDING_SEGMENT_SEC } from "@/lib/limits";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import type { Note } from "@/lib/types";
import { useAppStatus } from "../StatusProvider";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { Accordion, CuteMicIcon, ProgressBar, Spinner, Switch } from "../ui";
import { type AudioSource, openAudioSource, readLevel } from "./audio-source";
import { type JournalSession, appendChunk, deleteSession, saveSession } from "./journal";
import { RecoveryPanel } from "./RecoveryPanel";
import { type SegmentInfo, SegmentedRecorder, pickMimeType } from "./segment-recorder";
import { downloadBlob, extensionForType, uploadAudioNote } from "./upload-flow";

type Phase = "idle" | "starting" | "recording" | "paused" | "stopping" | "uploading" | "failed";
type Mode = "voice" | "meeting";

const BARS = 48;
const MIC_KEY = "saydraft-mic";

export function RecorderView() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const askConfirm = useConfirm();
  const { status } = useAppStatus();
  const appendTo = Number(params.get("append")) > 0 ? Number(params.get("append")) : null;
  const maxSec = status?.limits.maxRecordingSec ?? MAX_RECORDING_SEC;

  const [mode, setMode] = useState<Mode>(params.get("mode") === "meeting" ? "meeting" : "voice");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("auto");
  const [language, setLanguage] = useState("auto");
  const [speakers, setSpeakers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<{ segments: SegmentInfo[]; session: JournalSession } | null>(null);
  const [appendNote, setAppendNote] = useState<Note | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const sourceRef = useRef<AudioSource | null>(null);
  const recorderRef = useRef<SegmentedRecorder | null>(null);
  const sessionRef = useRef<JournalSession | null>(null);
  const frameRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const stopRef = useRef<(notice?: string) => Promise<void>>(async () => {});

  const busy = phase === "starting" || phase === "recording" || phase === "paused" || phase === "stopping" || phase === "uploading";
  const live = phase === "recording" || phase === "paused";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MIC_KEY);
      if (saved) setMicId(saved);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    if (status && !appendTo) {
      setLanguage(status.settings.defaultLanguage || "auto");
      if (mode === "meeting") setSpeakers(status.speakersAvailable);
    }
  }, [status, appendTo, mode]);
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

  const refreshMics = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    setMics(devices.filter((device) => device.kind === "audioinput" && device.deviceId && device.deviceId !== "default"));
  }, []);
  useEffect(() => {
    void refreshMics();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshMics);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshMics);
  }, [refreshMics]);

  const stopMeters = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const releaseHardware = useCallback(() => {
    stopMeters();
    sourceRef.current?.close();
    sourceRef.current = null;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, [stopMeters]);

  const startMeters = useCallback(() => {
    const analyser = sourceRef.current?.analyser;
    if (!analyser) return;
    const buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    let lastBar = 0;
    let lastBeat = 0;
    const tick = (now: number) => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      setElapsedMs(recorder.elapsedMs);
      if (now - lastBar > 70) {
        lastBar = now;
        const level = recorder.state === "recording" ? readLevel(analyser, buffer) : 0;
        setLevels((previous) => [...previous.slice(1), level]);
      }
      if (now - lastBeat > 5000 && sessionRef.current) {
        lastBeat = now;
        sessionRef.current.activeMs = recorder.elapsedMs;
        void saveSession(sessionRef.current).catch(() => undefined);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const upload = useCallback(
    async (segments: SegmentInfo[], session: JournalSession) => {
      setPhase("uploading");
      setProgress(0);
      setError(null);
      try {
        const extension = extensionForType(session.mimeType);
        const result = await uploadAudioNote({
          appendTo: session.appendTo,
          source: session.source,
          language: session.language,
          speakers: session.speakers,
          files: segments.map((segment) => ({
            blob: segment.blob,
            name: `recording-${segment.index + 1}.${extension}`,
            durationSec: segment.durationMs / 1000,
          })),
          onProgress: setProgress,
        });
        await deleteSession(session.id).catch(() => undefined);
        if (result.transcribeError) toast(result.transcribeError, "error");
        router.push(`/notes/${result.noteId}`);
      } catch (uploadError) {
        setFailed({ segments, session });
        setPhase("failed");
        setError(`${errorMessage(uploadError)} Your recording is safely saved here so you can try again.`);
      }
    },
    [router, toast],
  );

  const stop = useCallback(
    async (notice?: string) => {
      const recorder = recorderRef.current;
      if (!recorder || stoppingRef.current) return;
      stoppingRef.current = true;
      setPhase("stopping");
      stopMeters();
      const segments = await recorder.stop();
      recorderRef.current = null;
      releaseHardware();
      if (notice) toast(notice, "info");
      const session = sessionRef.current!;
      session.activeMs = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
      await saveSession(session).catch(() => undefined);
      stoppingRef.current = false;
      if (segments.length === 0) {
        setPhase("idle");
        setError("No sound came through. Check your microphone and try again.");
        await deleteSession(session.id).catch(() => undefined);
        return;
      }
      await upload(segments, session);
    },
    [releaseHardware, stopMeters, toast, upload],
  );
  stopRef.current = stop;

  const start = useCallback(async () => {
    setError(null);
    setFailed(null);
    setPhase("starting");
    setElapsedMs(0);
    setLevels(Array(BARS).fill(0));
    try {
      const source = await openAudioSource({
        deviceId: micId,
        meeting: mode === "meeting",
        onDisplayEnded: () => void stopRef.current("Screen sharing ended, so we wrapped up your recording."),
      });
      sourceRef.current = source;
      void refreshMics();
      const session: JournalSession = {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        updatedAt: Date.now(),
        mimeType: "audio/webm",
        source: mode === "meeting" ? "meeting" : "recording",
        appendTo,
        language,
        speakers,
        segments: {},
        activeMs: 0,
      };
      sessionRef.current = session;
      setActiveSessionId(session.id);
      const recorder = new SegmentedRecorder(
        source.stream,
        {
          mimeType: pickMimeType(),
          audioBitsPerSecond: RECORDING_BITRATE,
          segmentMs: (status?.limits.recordingSegmentSec ?? RECORDING_SEGMENT_SEC) * 1000,
          maxMs: maxSec * 1000,
          timesliceMs: 1000,
        },
        {
          onChunk: (segment, seq, blob) => void appendChunk(session.id, segment, seq, blob).catch(() => undefined),
          onSegment: (info) => {
            session.segments[info.index] = info.durationMs;
            void saveSession(session).catch(() => undefined);
          },
          onLimit: () => void stopRef.current(`Reached the ${Math.round(maxSec / 3600)}-hour recording length — saving your note now.`),
          onError: (recorderError) => {
            setError(recorderError.message);
            void stopRef.current();
          },
        },
      );
      recorderRef.current = recorder;
      recorder.start();
      session.mimeType = recorder.mimeType;
      await saveSession(session).catch(() => undefined);
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeLockRef.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        // Wake lock is optional.
      }
      setPhase("recording");
      startMeters();
    } catch (startError) {
      releaseHardware();
      recorderRef.current = null;
      setPhase("idle");
      setError(errorMessage(startError));
    }
  }, [appendTo, language, maxSec, micId, mode, refreshMics, releaseHardware, speakers, startMeters, status]);

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setPhase("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setPhase("recording");
    }
    setElapsedMs(recorder.elapsedMs);
  }

  async function restart() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.elapsedMs > 10_000) {
      const confirmed = await askConfirm({
        title: "Start over?",
        message: "The recording so far will be discarded and a fresh one will begin.",
        confirmLabel: "Start over",
        cancelLabel: "Keep recording",
        tone: "danger",
        icon: RotateCcw,
      });
      // The recording keeps running behind the dialog, so make sure it is still the one we asked about.
      if (!confirmed || recorderRef.current !== recorder || stoppingRef.current) return;
    }
    recorder.discard();
    recorderRef.current = null;
    releaseHardware();
    if (sessionRef.current) await deleteSession(sessionRef.current.id).catch(() => undefined);
    await start();
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (recorderRef.current || stoppingRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  useEffect(() => {
    return () => {
      void recorderRef.current?.stop();
      recorderRef.current = null;
      releaseHardware();
    };
  }, [releaseHardware]);

  const remainingSec = Math.max(0, maxSec - elapsedMs / 1000);
  const statusLine = {
    idle: mode === "meeting" ? "Ready to record your meeting" : "Ready to record",
    starting: mode === "meeting" ? "Pick the tab or window with meeting audio…" : "Connecting to microphone…",
    recording: "Listening",
    paused: "Paused",
    stopping: "Wrapping up…",
    uploading: "Saving recording…",
    failed: "Couldn't save recording",
  }[phase];
  const backHref = appendTo ? `/notes/${appendTo}` : "/";

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-2 pt-1">
        <Link
          href={backHref}
          onClick={(event) => {
            // Opening in a new tab leaves this page alone, so there is nothing to confirm.
            if (!live || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            // The answer arrives later, so hold the navigation now and perform it ourselves.
            event.preventDefault();
            void askConfirm({
              title: "Stop recording?",
              message: "Your audio is saved, so you can recover it anytime.",
              confirmLabel: "Stop & go back",
              cancelLabel: "Keep recording",
              icon: Square,
            }).then((confirmed) => {
              if (confirmed) router.push(backHref);
            });
          }}
          className="frosted-topbar inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[var(--ink)] transition-opacity hover:opacity-65"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div role="tablist" aria-label="Recording mode" className="frosted-topbar inline-flex rounded-full p-1">
          {(
            [
              ["voice", "Voice note", Mic],
              ["meeting", "Meeting", MonitorSpeaker],
            ] as const
          ).map(([value, label, Icon]) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={busy}
                onClick={() => {
                  setMode(value);
                  if (value === "meeting" && status?.speakersAvailable) setSpeakers(true);
                }}
                className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed ${
                  selected ? "text-[var(--accent-ink)]" : "text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="record-mode-pill"
                    transition={SPRING_SNAPPY}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[var(--accent)] shadow-xs"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="flex flex-1 flex-col items-center justify-center py-8 text-center"
      >
        {appendNote && (
          <p className="mb-4 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-sm text-[var(--ink-muted)]">
            Adding to <span className="font-semibold text-[var(--ink)]">{appendNote.title || "Untitled note"}</span>
          </p>
        )}
        {phase === "idle" && !appendTo && (
          <div className="mb-6 w-full">
            <RecoveryPanel excludeId={activeSessionId} onRecovered={(noteId) => router.push(`/notes/${noteId}`)} />
          </div>
        )}

        <div className="flex min-h-5 items-center text-sm font-medium text-[var(--ink-muted)]" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${phase}-${mode}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="flex items-center gap-2"
            >
              {phase === "recording" && <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--record-live)]" />}
              {statusLine}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="mt-2 text-6xl font-semibold tracking-tight tabular-nums text-[var(--ink)]" aria-label="Recording time">
          {formatDuration(elapsedMs / 1000)}
        </div>
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
          {live ? `${formatDuration(remainingSec)} remaining` : `Up to ${Math.round(maxSec / 3600)} hours per note`}
        </p>

        <div className="mt-8 flex h-24 w-full max-w-lg items-center justify-center gap-[3px]" aria-hidden="true">
          {levels.map((level, index) => (
            <span
              key={index}
              className={`w-[5px] rounded-full transition-[height,background-color] duration-75 ${
                phase === "recording" ? "bg-[var(--record-live)]" : "bg-[var(--border)]"
              }`}
              style={{ height: `${Math.max(6, Math.round(level * 92))}px`, opacity: 0.35 + (index / BARS) * 0.65 }}
            />
          ))}
        </div>

        {phase === "uploading" && (
          <div className="mt-6 w-full max-w-sm space-y-2">
            <ProgressBar value={progress} label="Saving progress" />
            <p className="text-xs text-[var(--ink-muted)]">{Math.round(progress * 100)}% saved</p>
          </div>
        )}

        {error && (
          <div role="alert" className="alert alert-error mt-6 w-full max-w-md text-left">
            {error}
          </div>
        )}

        {phase === "failed" && failed && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void upload(failed.segments, failed.session)}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const extension = extensionForType(failed.session.mimeType);
                failed.segments.forEach((segment) => downloadBlob(segment.blob, `saydraft-recording-${segment.index + 1}.${extension}`));
              }}
            >
              <Download className="h-4 w-4" /> Download audio
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                const confirmed = await askConfirm({
                  title: "Discard this recording?",
                  message: "Its audio will be deleted for good. Download it first if you want to keep a copy.",
                  confirmLabel: "Discard",
                  tone: "danger",
                  icon: Trash2,
                });
                if (!confirmed) return;
                await deleteSession(failed.session.id).catch(() => undefined);
                setFailed(null);
                setError(null);
                setPhase("idle");
                setElapsedMs(0);
              }}
            >
              Discard
            </button>
          </div>
        )}

        <Accordion open={!busy && phase !== "failed"} className="w-full max-w-md">
          <div className="grid gap-3 pt-8 text-left sm:grid-cols-2">
            <label className="surface-card flex flex-col gap-1 rounded-2xl px-4 py-3 text-xs font-medium text-[var(--ink-muted)]">
              Microphone
              <select
                value={micId}
                onChange={(event) => {
                  setMicId(event.target.value);
                  try {
                    localStorage.setItem(MIC_KEY, event.target.value);
                  } catch {
                    // ignore
                  }
                }}
                className="cursor-pointer bg-transparent text-sm font-semibold text-[var(--ink)] outline-none"
              >
                <option value="auto">Default microphone</option>
                {mics.map((mic, index) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="surface-card flex flex-col gap-1 rounded-2xl px-4 py-3 text-xs font-medium text-[var(--ink-muted)]">
              Speaker&apos;s language
              <select
                value={language}
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
              <div className="surface-card rounded-2xl px-4 py-3 sm:col-span-2">
                <Switch
                  checked={speakers}
                  onChange={setSpeakers}
                  label="Multi-speaker"
                  description="Label who said what (Speaker A, Speaker B…). Best for meetings and interviews."
                />
              </div>
            )}
            <Accordion open={mode === "meeting"} className="sm:col-span-2">
              <p className="flex gap-2 px-1 text-xs text-[var(--ink-muted)]">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Captures both your voice and your meeting window audio. Headphones work best to prevent echo.
              </p>
            </Accordion>
          </div>
        </Accordion>

        <div className="mt-10 flex items-center justify-center gap-6">
          <AnimatePresence mode="popLayout" initial={false}>
            {live && (
              <motion.button
                key="restart"
                type="button"
                initial={{ opacity: 0, scale: 0.72, x: 16 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.72, x: 16 }}
                whileTap={TAP_ICON}
                transition={SPRING_SNAPPY}
                onClick={() => void restart()}
                aria-label="Restart recording"
                title="Restart"
                className="surface-card flex h-14 w-14 cursor-pointer items-center justify-center rounded-full text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink)]"
              >
                <RotateCcw className="h-5 w-5" />
              </motion.button>
            )}

            {phase === "idle" || phase === "failed" ? (
              <motion.button
                key="start"
                type="button"
                initial={{ opacity: 0.6, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.6, scale: 0.9 }}
                whileHover={phase === "failed" ? undefined : { scale: 1.04 }}
                whileTap={phase === "failed" ? undefined : TAP_PRESS}
                transition={SPRING_SNAPPY}
                onClick={() => void start()}
                disabled={phase === "failed"}
                aria-label={mode === "meeting" ? "Start recording meeting" : "Start recording"}
                className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-float)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={mode}
                    initial={{ scale: 0.75, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.75, opacity: 0 }}
                    transition={{ duration: 0.14, ease: EASE_OUT }}
                    className="inline-flex"
                  >
                    {mode === "meeting" ? <MonitorSpeaker className="h-8 w-8" /> : <CuteMicIcon className="h-11 w-11" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            ) : live ? (
              <motion.button
                key="stop"
                type="button"
                initial={{ opacity: 0.6, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.6, scale: 0.88 }}
                whileHover={{ scale: 1.04 }}
                whileTap={TAP_PRESS}
                transition={SPRING_SNAPPY}
                onClick={() => void stop()}
                aria-label="Stop and transcribe"
                title="Stop & save note"
                className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-[var(--record-live)] text-white shadow-[var(--shadow-float)] ring-8 ring-[var(--record-live)]/20"
              >
                <Square className="h-7 w-7 fill-current" />
              </motion.button>
            ) : (
              <motion.div
                key="busy"
                initial={{ opacity: 0.5, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.5, scale: 0.9 }}
                transition={SPRING_SNAPPY}
                className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)]"
              >
                <Spinner className="h-8 w-8" />
              </motion.div>
            )}

            {live && (
              <motion.button
                key="pause"
                type="button"
                initial={{ opacity: 0, scale: 0.72, x: -16 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.72, x: -16 }}
                whileTap={TAP_ICON}
                transition={SPRING_SNAPPY}
                onClick={togglePause}
                aria-label={phase === "paused" ? "Resume recording" : "Pause recording"}
                title={phase === "paused" ? "Resume" : "Pause"}
                className="surface-card flex h-14 w-14 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                {phase === "paused" ? <Play className="ml-0.5 h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <Accordion open={live}>
          <p className="pt-5 text-xs text-[var(--ink-muted)]">Tap Stop when you&apos;re finished — your transcript starts right away.</p>
        </Accordion>
      </motion.main>
    </div>
  );
}
