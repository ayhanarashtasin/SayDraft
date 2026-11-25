"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, ChevronDown, Download, Mic, MonitorSpeaker, RotateCcw, Square, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { formatCountdown } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { MAX_RECORDING_SEC, RECORDING_BITRATE, RECORDING_SEGMENT_SEC } from "@/lib/limits";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import type { Note } from "@/lib/types";
import { BackArrowIcon, PauseBarsIcon, PlayTriangleIcon, RecordStartRingIcon, RestartLoopIcon, StopSquareRingIcon } from "../icons";
import { useAppStatus } from "../StatusProvider";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { ProgressBar, Spinner, Switch } from "../ui";
import { type AudioSource, openAudioSource, readFourBands } from "./audio-source";
import { type JournalSession, appendChunk, deleteSession, listSessions, saveSession } from "./journal";
import { LiveTranscript, useLiveTranscript } from "./LiveTranscript";
import { RecoveryPanel, isRecoverableSession } from "./RecoveryPanel";
import { type SegmentInfo, SegmentedRecorder, pickMimeType } from "./segment-recorder";
import { downloadBlob, extensionForType, uploadAudioNote } from "./upload-flow";

type Phase = "idle" | "starting" | "recording" | "paused" | "stopping" | "uploading" | "failed";
type Mode = "voice" | "meeting" | "live";

const MIC_KEY = "saydraft-mic";
const BELL_WEIGHTS: [number, number, number, number] = [0.76, 1.0, 1.0, 0.76];

export function RecorderView() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const askConfirm = useConfirm();
  const { status } = useAppStatus();
  const appendTo = Number(params.get("append")) > 0 ? Number(params.get("append")) : null;
  const recoverMode = params.get("recover") === "1";
  const maxSec = status?.limits.maxRecordingSec ?? MAX_RECORDING_SEC;

  const requestedMode = params.get("mode");
  const [mode, setMode] = useState<Mode>(requestedMode === "meeting" || requestedMode === "live" ? requestedMode : "voice");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bands, setBands] = useState<[number, number, number, number]>([0.1, 0.25, 0.2, 0.1]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [defaultMicGroupId, setDefaultMicGroupId] = useState<string | null>(null);
  const [micId, setMicId] = useState("auto");
  const [languagePreference, setLanguage] = useState<string | null>(null);
  const [speakerPreference, setSpeakers] = useState<boolean | null>(null);
  const [switchingMic, setSwitchingMic] = useState(false);
  const [sharingPending, setSharingPending] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<{ segments: SegmentInfo[]; session: JournalSession } | null>(null);
  const [appendNote, setAppendNote] = useState<Note | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const language = languagePreference ?? (appendTo ? appendNote?.language : status?.settings.defaultLanguage) ?? "auto";
  const speakers = speakerPreference ?? (appendTo ? Boolean(appendNote?.speakers) : mode === "meeting" && Boolean(status?.speakersAvailable));
  const sourceRef = useRef<AudioSource | null>(null);
  const recorderRef = useRef<SegmentedRecorder | null>(null);
  const sessionRef = useRef<JournalSession | null>(null);
  const sessionSettingsRef = useRef({ language, speakers });
  const frameRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const autoTriedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const stopRef = useRef<(notice?: string) => Promise<void>>(async () => {});

  const recordingActive = phase === "recording" || phase === "paused";
  const controlsLocked = phase !== "idle" && !recordingActive;
  const modeLocked = sharingPending || (controlsLocked && !(phase === "starting" && mode !== "meeting"));
  const previewActive = mode === "live" && phase === "recording" && !sharingPending;
  const selectedMic = micId === "auto" ? null : mics.find((device) => device.deviceId === micId) ?? null;
  const useSystemMic = micId === "auto" || !selectedMic || (defaultMicGroupId !== null && selectedMic.groupId === defaultMicGroupId);
  const { preview, stop: stopPreview, retry: retryPreview } = useLiveTranscript(
    sourceRef,
    activeSessionId,
    previewActive,
    language,
    micId,
    useSystemMic,
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MIC_KEY);
      if (saved) setMicId(saved);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    sessionSettingsRef.current = { language, speakers };
    const session = sessionRef.current;
    if (!session || !recorderRef.current || stoppingRef.current) return;
    session.language = language;
    session.speakers = speakers;
    void saveSession(session).catch(() => undefined);
  }, [language, speakers]);
  useEffect(() => {
    if (!appendTo) return;
    api<{ note: Note }>(`/api/notes/${appendTo}`)
      .then(({ note }) => setAppendNote(note))
      .catch(() => setError("We couldn't find the note you want to add to."));
  }, [appendTo]);

  const refreshMics = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const audioInputs = devices.filter((device) => device.kind === "audioinput" && device.deviceId);
    const defaultDevice = audioInputs.find((device) => device.deviceId === "default");
    setDefaultMicGroupId(defaultDevice?.groupId || null);
    const physicalMics = audioInputs.filter((device) => device.deviceId !== "default" && device.deviceId !== "communications");
    setMics(physicalMics);
    if (physicalMics.length > 0) {
      setMicId((current) => (current === "auto" || physicalMics.some((device) => device.deviceId === current) ? current : "auto"));
    }
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
    stopPreview();
    stopMeters();
    sourceRef.current?.close();
    sourceRef.current = null;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, [stopMeters, stopPreview]);

  const startMeters = useCallback(() => {
    const analyser = sourceRef.current?.analyser;
    if (!analyser) return;
    const freqBuffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    let lastBar = 0;
    let lastBeat = 0;
    const tick = (now: number) => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      if (now - lastBar > 90) {
        lastBar = now;
        setElapsedMs(recorder.elapsedMs);
        if (recorder.state === "recording") {
          setBands(readFourBands(analyser, freqBuffer));
        }
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
      const journalSaved = saveSession(session).catch(() => undefined);
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
        await journalSaved;
        await deleteSession(session.id).catch(() => undefined);
        if (result.transcribeError) toast(result.transcribeError, "error");
        router.push(`/notes/${result.noteId}`);
      } catch (uploadError) {
        await journalSaved;
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
      const session = sessionRef.current;
      if (!recorder || !session || stoppingRef.current) return;
      stoppingRef.current = true;
      stopPreview();
      setPhase("stopping");
      stopMeters();
      const finished = recorder.stop();
      sourceRef.current?.stopSharing();
      setSharingPending(false);
      const segments = await finished;
      recorderRef.current = null;
      releaseHardware();
      if (notice) toast(notice, "info");
      session.activeMs = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
      stoppingRef.current = false;
      if (segments.length === 0) {
        setActiveSessionId(null);
        setPhase("idle");
        setError("No sound came through. Check your microphone and try again.");
        await deleteSession(session.id).catch(() => undefined);
        return;
      }
      await upload(segments, session);
    },
    [releaseHardware, stopMeters, stopPreview, toast, upload],
  );
  stopRef.current = stop;

  const start = useCallback(async (existingSource?: AudioSource) => {
    if (recorderRef.current || stoppingRef.current || (sourceRef.current && !existingSource)) return;
    autoTriedRef.current = true;
    setError(null);
    setFailed(null);
    setPhase("starting");
    setElapsedMs(0);
    setBands([0.1, 0.25, 0.2, 0.1]);
    let source = existingSource;
    try {
      if (!source) {
        source = openAudioSource({
          deviceId: micId,
          meeting: mode === "meeting",
          onDisplayEnded: () => {
            if (recorderRef.current) {
              void stopRef.current("Screen sharing ended. Saving your recording.");
            } else {
              releaseHardware();
              setSharingPending(false);
              setPhase("idle");
              setError("Screen sharing ended before recording started. Try sharing again.");
            }
          },
        });
        sourceRef.current = source;
        await source.ready;
        if (sourceRef.current !== source) return;
        void refreshMics();
      }
      const session: JournalSession = {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        updatedAt: Date.now(),
        mimeType: "audio/webm",
        source: source.sharing ? "meeting" : "recording",
        appendTo,
        ...sessionSettingsRef.current,
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
      void saveSession(session).catch(() => undefined);
      setPhase("recording");
      startMeters();
      if (!existingSource) {
        void navigator.wakeLock?.request("screen").then((lock) => {
          if (sourceRef.current === source && !stoppingRef.current) wakeLockRef.current = lock;
          else return lock.release();
        }).catch(() => undefined);
      }
    } catch (startError) {
      if (source && sourceRef.current !== source) return;
      releaseHardware();
      recorderRef.current = null;
      setPhase("idle");
      setError(errorMessage(startError));
    }
  }, [appendTo, maxSec, micId, mode, refreshMics, releaseHardware, startMeters, status]);

  // If mic permission is already granted in voice or live mode, start right away like Letterly,
  // unless opened for recovery or an unsaved recording is already waiting to be recovered.
  useEffect(() => {
    if (autoTriedRef.current || mode === "meeting" || phase !== "idle" || recoverMode) return;
    let cancelled = false;
    Promise.all([
      navigator.permissions?.query({ name: "microphone" as PermissionName }).catch(() => null),
      listSessions(),
    ])
      .then(([res, sessions]) => {
        if (cancelled || autoTriedRef.current) return;
        autoTriedRef.current = true;
        if (sessions.some((s) => isRecoverableSession(s))) return;
        if (res?.state === "granted") void start();
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [mode, phase, recoverMode, start]);

  async function changeMode(nextMode: Mode) {
    if (nextMode === mode || modeLocked || stoppingRef.current) return;
    autoTriedRef.current = true;
    setError(null);
    // Stop sending preview clips before the source can add shared meeting audio.
    if (mode === "live") stopPreview();
    const source = sourceRef.current;
    if (source && nextMode === "meeting") {
      setSharingPending(true);
      try {
        if (!(await source.startSharing()) || sourceRef.current !== source || stoppingRef.current) return;
      } catch (shareError) {
        if (sourceRef.current === source && !stoppingRef.current) setError(errorMessage(shareError));
        return;
      } finally {
        setSharingPending(false);
        // A rejected share can settle before React renders the pending state.
        if (mode === "live" && !source.sharing && sourceRef.current === source && !stoppingRef.current) retryPreview();
      }
      const session = sessionRef.current;
      if (session && recorderRef.current) {
        session.source = "meeting";
        void saveSession(session).catch(() => undefined);
      }
    } else if (source) {
      source.stopSharing();
    }
    setMode(nextMode);
  }

  async function changeMicrophone(deviceId: string) {
    const source = sourceRef.current;
    if (source) {
      setSwitchingMic(true);
      setError(null);
      try {
        await source.setMicrophone(deviceId);
        if (sourceRef.current !== source || stoppingRef.current) return;
      } catch (micError) {
        if (sourceRef.current === source && !stoppingRef.current) setError(errorMessage(micError));
        return;
      } finally {
        setSwitchingMic(false);
      }
    }
    setMicId(deviceId);
    try {
      localStorage.setItem(MIC_KEY, deviceId);
    } catch {
      // Optional.
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      stopPreview();
      setPhase("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setPhase("recording");
    }
    setElapsedMs(recorder.elapsedMs);
  }

  async function restart() {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 260);
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
      if (!confirmed) return;
    }
    const source = sourceRef.current;
    if (!source || recorderRef.current !== recorder || stoppingRef.current) return;
    stopPreview();
    recorder.discard();
    recorderRef.current = null;
    stopMeters();
    if (sessionRef.current) void deleteSession(sessionRef.current.id).catch(() => undefined);
    await start(source);
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
  const backHref = appendTo ? `/notes/${appendTo}` : "/";
  const autoMicLabel = mics[0]?.label ? `Auto-detect (${mics[0].label})` : "Auto-detect";

  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--canvas)]">
      <header className="sticky top-0 z-20 grid min-h-[3.875rem] w-full grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--border)]/70 bg-[var(--canvas)]/90 px-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center">
          <Link
            href={backHref}
            aria-label="Back"
            onClick={(event) => {
              const busy = recordingActive || phase === "stopping" || phase === "uploading";
              if (!busy || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              void askConfirm({
                title: recordingActive ? "Stop recording?" : "Leave while saving?",
                message: recordingActive
                  ? "Your audio is saved, so you can recover it anytime."
                  : "Your recording is still uploading. You can recover it if you leave now.",
                confirmLabel: recordingActive ? "Stop & go back" : "Leave anyway",
                cancelLabel: recordingActive ? "Keep recording" : "Keep saving",
                icon: Square,
              }).then(async (confirmed) => {
                if (!confirmed) return;
                const recorder = recorderRef.current;
                if (recorder && recorder.elapsedMs < 1500) {
                  recorder.discard();
                  recorderRef.current = null;
                  releaseHardware();
                  if (sessionRef.current) await deleteSession(sessionRef.current.id).catch(() => undefined);
                }
                router.push(backHref);
              });
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
          >
            <BackArrowIcon className="h-5 w-5" />
          </Link>
        </div>

        <div className="flex justify-center">
          <span
            aria-label="Remaining recording time"
            className="inline-flex items-center rounded-full bg-[var(--surface-panel)] px-3.5 py-1 text-sm font-semibold tabular-nums text-[var(--brand-strong)] dark:text-[var(--brand)]"
          >
            {phase === "stopping" || phase === "uploading" ? "Saving…" : formatCountdown(remainingSec)}
          </span>
        </div>

        <div className="flex justify-end">
          <div role="group" aria-label="Recording mode" className="inline-flex rounded-full bg-[var(--surface-panel)] p-0.5">
            {(
              [
                ["voice", "Voice", Mic],
                ["meeting", "Meeting", MonitorSpeaker],
                ["live", "Live", Captions],
              ] as const
            ).map(([value, label, Icon]) => {
              const selected = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={label}
                  disabled={modeLocked}
                  onClick={() => void changeMode(value)}
                  className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5 ${
                    selected ? "bg-[var(--cta-bg)] text-[var(--cta-ink)]" : "text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Icon aria-hidden="true" className={value === "live" ? "hidden h-3 w-3 sm:block" : "h-3 w-3"} />
                  <span className={value === "live" ? undefined : "hidden sm:inline"}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-8 text-center"
      >
        {appendNote && (
          <p className="mb-4 rounded-full border border-[var(--border)] bg-[var(--surface-panel)] px-4 py-1 text-xs font-medium text-[var(--ink-subtle)]">
            Adding to <span className="font-semibold text-[var(--ink)]">{appendNote.title || "Untitled note"}</span>
          </p>
        )}
        {phase === "idle" && !appendTo && (
          <div className="mb-6 w-full">
            <RecoveryPanel excludeId={activeSessionId} onRecovered={(noteId) => router.push(`/notes/${noteId}`)} />
          </div>
        )}

        {mode === "live" ? (
          <LiveTranscript
            key={activeSessionId}
            preview={phase === "idle" || phase === "starting" ? null : preview}
            active={previewActive}
            phase={phase}
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-[15rem] items-center justify-center gap-1.5 sm:gap-2"
          >
            {bands.map((level, index) => {
              const weight = BELL_WEIGHTS[index];
              const baseHeight = phase === "recording" ? 82.5 + level * 150 * weight : 82.5 * (0.85 + 0.15 * weight);
              return (
                <div
                  key={index}
                  className={`w-[4rem] min-h-[4rem] rounded-full transition-[height,opacity] duration-[200ms] ease-out sm:w-[5.15625rem] sm:min-h-[5.15625rem] ${
                    phase === "paused" ? "bg-[var(--ink)]/55" : "bg-[var(--ink)]"
                  }`}
                  style={{ height: `${Math.round(baseHeight)}px` }}
                />
              );
            })}
          </div>
        )}

        {((!recordingActive && phase !== "failed") || sharingPending) && (
          <p className="mt-4 text-xs font-medium text-[var(--ink-muted)]" aria-live="polite">
            {sharingPending || (phase === "starting" && mode === "meeting")
              ? "Pick the tab or window with meeting audio…"
              : phase === "starting"
                ? "Connecting microphone…"
                : phase === "stopping"
                  ? "Preparing audio…"
                  : phase === "uploading"
                    ? progress >= 0.75
                      ? "Transcribing…"
                      : "Uploading recording…"
                    : mode === "meeting"
                      ? "Tap record to capture your mic and meeting audio"
                      : mode === "live"
                        ? "Tap record to start live transcription"
                        : "Tap the red button to start recording"}
          </p>
        )}

        {phase === "uploading" && (
          <div className="mt-4 w-full max-w-sm space-y-2">
            <ProgressBar value={progress} label="Saving progress" />
            <p className="text-xs text-[var(--ink-muted)]">
              {progress >= 0.75 ? "Finishing transcript…" : `${Math.round(progress * 100)}% saved`}
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="alert alert-error mt-5 w-full max-w-md text-left">
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
                setActiveSessionId(null);
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

        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="relative inline-flex max-w-[min(28rem,calc(100vw-2.5rem))] items-center rounded-full bg-[var(--surface-panel)]">
            <select
              aria-label="Microphone"
              disabled={controlsLocked || switchingMic}
              value={micId}
              onChange={(event) => void changeMicrophone(event.target.value)}
              className="w-full cursor-pointer appearance-none truncate rounded-full bg-transparent py-2 pl-4 pr-9 text-xs font-medium text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--brand)] disabled:cursor-not-allowed sm:text-[0.8125rem]"
            >
              <option value="auto">{autoMicLabel}</option>
              {mics.map((mic, index) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-subtle)]" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {status?.speakersAvailable && (
              <div className="inline-flex items-center gap-3 rounded-full bg-[var(--surface-panel)] py-1.5 pl-4 pr-2">
                <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--ink)]">
                  <Users className="h-3.5 w-3.5 text-[var(--ink-subtle)]" /> Multi-speaker
                </span>
                <Switch checked={speakers} disabled={controlsLocked} onChange={setSpeakers} label="Multi-speaker" hideLabel />
              </div>
            )}

            <div className="relative inline-flex items-center rounded-full bg-[var(--surface-panel)]">
              <select
                aria-label="Speaker language"
                disabled={controlsLocked}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="cursor-pointer appearance-none rounded-full bg-transparent py-2 pl-3.5 pr-8 text-xs font-medium text-[var(--ink-subtle)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--brand)] disabled:cursor-not-allowed"
              >
                <option value="auto">Lang: Auto</option>
                {LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
            </div>
          </div>
        </div>
      </motion.main>

      <footer className="pb-10 pt-2">
        <div className="flex items-center justify-center gap-10">
          <AnimatePresence mode="popLayout" initial={false}>
            {recordingActive && (
              <motion.button
                key="restart"
                type="button"
                initial={{ opacity: 0, scale: 0.72, x: 14 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.72, x: 14 }}
                whileTap={TAP_ICON}
                transition={SPRING_SNAPPY}
                onClick={() => void restart()}
                aria-label="Restart recording"
                title="Restart"
                className="flex h-[3.375rem] w-[3.375rem] cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
              >
                <RestartLoopIcon className={`h-6 w-6 ${spinning ? "spin-once" : ""}`} />
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
                aria-label={mode === "meeting" ? "Start recording meeting" : mode === "live" ? "Start live recording" : "Start recording"}
                className="cursor-pointer rounded-full text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RecordStartRingIcon className="h-[3.75rem] w-[3.75rem]" />
              </motion.button>
            ) : recordingActive ? (
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
                className="cursor-pointer rounded-full text-[var(--ink)]"
              >
                <StopSquareRingIcon className="h-[3.75rem] w-[3.75rem]" />
              </motion.button>
            ) : (
              <motion.div
                key="busy"
                initial={{ opacity: 0.5, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.5, scale: 0.9 }}
                transition={SPRING_SNAPPY}
                className="flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-panel)] text-[var(--ink-muted)]"
              >
                <Spinner className="h-7 w-7" />
              </motion.div>
            )}

            {recordingActive && (
              <motion.button
                key="pause"
                type="button"
                initial={{ opacity: 0, scale: 0.72, x: -14 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.72, x: -14 }}
                whileTap={TAP_ICON}
                transition={SPRING_SNAPPY}
                onClick={togglePause}
                aria-label={phase === "paused" ? "Resume recording" : "Pause recording"}
                title={phase === "paused" ? "Resume" : "Pause"}
                className="flex h-[3.375rem] w-[3.375rem] cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={phase}
                    initial={{ scale: 0.75, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.75, opacity: 0 }}
                    transition={{ duration: 0.14, ease: EASE_OUT }}
                    className="inline-flex"
                  >
                    {phase === "paused" ? <PlayTriangleIcon className="ml-0.5 h-5 w-5" /> : <PauseBarsIcon className="h-5 w-5" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}
