"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LifeBuoy, Trash2, UploadCloud } from "lucide-react";
import { errorMessage } from "@/lib/api-client";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { ProgressBar, Spinner } from "../ui";
import { type JournalSession, deleteSession, listSessions, loadSegments } from "./journal";
import { downloadBlob, extensionForType, uploadAudioNote } from "./upload-flow";

/** Sessions untouched for this long are no longer being recorded (the recorder saves a heartbeat). */
const STALE_MS = 20_000;

export function useRecoverableSessions(excludeId?: string | null) {
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const refresh = useCallback(async () => {
    const all = await listSessions();
    setSessions(all.filter((session) => session.id !== excludeId && Date.now() - session.updatedAt > STALE_MS));
  }, [excludeId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { sessions, refresh };
}

function sessionDuration(session: JournalSession): number {
  const finished = Object.values(session.segments).reduce((sum, value) => sum + value, 0);
  // Each saved chunk holds about one second of audio, which covers crashes before the last save.
  return Math.max(session.activeMs, finished, (session.chunkCount ?? 0) * 1000) / 1000;
}

/** Lists recordings that were never uploaded (closed tab, crash, failed upload) and recovers them. */
export function RecoveryPanel({ excludeId, onRecovered }: { excludeId?: string | null; onRecovered: (noteId: number) => void }) {
  const toast = useToast();
  const askConfirm = useConfirm();
  const { sessions, refresh } = useRecoverableSessions(excludeId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  if (sessions.length === 0) return null;

  async function recover(session: JournalSession) {
    setBusyId(session.id);
    setProgress(0);
    try {
      const segments = await loadSegments(session);
      if (segments.length === 0) throw new Error("This recording has no audio left to recover.");
      const extension = extensionForType(session.mimeType);
      const result = await uploadAudioNote({
        appendTo: session.appendTo,
        source: session.source,
        language: session.language,
        speakers: session.speakers,
        files: segments.map((segment) => ({
          blob: segment.blob,
          name: `recovered-${segment.index + 1}.${extension}`,
          durationSec: segment.durationMs / 1000,
        })),
        onProgress: setProgress,
      });
      await deleteSession(session.id);
      if (result.transcribeError) toast(result.transcribeError, "error");
      else toast("Recording recovered. Transcribing now.");
      onRecovered(result.noteId);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusyId(null);
      void refresh();
    }
  }

  async function download(session: JournalSession) {
    const segments = await loadSegments(session);
    const extension = extensionForType(session.mimeType);
    segments.forEach((segment) => downloadBlob(segment.blob, `saydraft-recording-${new Date(session.startedAt).toISOString().slice(0, 10)}-${segment.index + 1}.${extension}`));
  }

  return (
    <section className="alert alert-warning w-full space-y-3 text-left" aria-label="Unsaved recordings">
      <div className="flex items-center gap-2 font-medium">
        <LifeBuoy className="h-4 w-4 text-[var(--warning)]" />
        {sessions.length === 1 ? "An unsaved recording was found" : `${sessions.length} unsaved recordings were found`}
      </div>
      <p className="text-xs text-[var(--ink-muted)]">These were recorded but never uploaded, for example because the tab closed. They are stored only in this browser.</p>
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li key={session.id} className="surface-card rounded-2xl px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {session.source === "meeting" ? "Meeting" : "Voice note"} · {formatDuration(sessionDuration(session))}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {formatDateTime(session.startedAt)}
                  {session.appendTo ? " · adds to an existing note" : ""}
                </p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => void recover(session)}>
                {busyId === session.id ? <Spinner className="h-3.5 w-3.5" /> : <UploadCloud className="h-3.5 w-3.5" />} Transcribe
              </button>
              <button type="button" className="icon-btn h-8 w-8" aria-label="Download recording" onClick={() => void download(session)}>
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="icon-btn h-8 w-8 hover:!text-[var(--danger)]"
                aria-label="Discard recording"
                disabled={busyId !== null}
                onClick={async () => {
                  const confirmed = await askConfirm({
                    title: "Delete this recording?",
                    message: "This unsaved recording will be permanently deleted. Download it first if you want to keep a copy.",
                    confirmLabel: "Delete",
                    tone: "danger",
                    icon: Trash2,
                  });
                  if (!confirmed) return;
                  await deleteSession(session.id).catch(() => undefined);
                  void refresh();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {busyId === session.id && (
              <div className="mt-2">
                <ProgressBar value={progress} label="Upload progress" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
