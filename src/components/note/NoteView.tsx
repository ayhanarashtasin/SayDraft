"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Globe,
  Languages,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ApiError, api, errorMessage, postStream } from "@/lib/api-client";
import { formatNoteTimestamp, slugify } from "@/lib/format";
import { findLanguage, languageLabel } from "@/lib/languages";
import { EASE_OUT, SIDE_PANEL_TRANSITION, SPRING_SMOOTH, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import type { IntegrationAction, Note, Prompt, Rewrite, Tag } from "@/lib/types";
import {
  ArchiveBoxSolidIcon,
  BackArrowIcon,
  BoltFilledIcon,
  BookSolidIcon,
  CheckCircleFilledIcon,
  CopySquaresIcon,
  DictionaryIllustration,
  ExportAudioSolidIcon,
  GlobeLangSolidIcon,
  HashThickIcon,
  MicSolidIcon,
  MoreDotsVerticalIcon,
  PaperclipClipIcon,
  PlayTriangleIcon,
  ScissorsSolidIcon,
  SparklesFilledIcon,
  SpeakersSolidIcon,
  TranslateDualIcon,
  TrashFilledIcon,
  WriteNoteLinesIcon,
} from "../icons";
import { consumeReadyNote, downloadBlob } from "../record/upload-flow";
import { GalleryModal } from "../settings/GallerySection";
import { useAppStatus } from "../StatusProvider";
import { TagModal } from "../TagManager";
import { type ConfirmOptions, useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { Accordion, Dialog, Drawer, Popover, ProgressBar, Spinner, TagDot } from "../ui";
import { AudioPlayer } from "./AudioPlayer";
import { LanguageDialog } from "./LanguageDialog";
import { type RewriteSource, RewritePanel } from "./RewritePanel";
import { TranslatePanel } from "./TranslatePanel";

type Version = "original" | number;
type SidePanel = "closed" | "rewrite" | "translate";
type RewriteRequest = { promptId: number } | { instruction: string } | { translateTo: string };

function versionText(note: Note, version: Version): string {
  if (version === "original") return note.transcript;
  return note.rewrites.find((rewrite) => rewrite.id === version)?.text ?? "";
}

export function NoteView({ noteId }: { noteId: number }) {
  const router = useRouter();
  const toast = useToast();
  const askConfirm = useConfirm();
  const { status } = useAppStatus();

  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [actions, setActions] = useState<IntegrationAction[]>([]);

  const [active, setActive] = useState<Version>("original");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [streaming, setStreaming] = useState<Record<number, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>("closed");
  const [isDesktop, setIsDesktop] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerAutoPlay, setPlayerAutoPlay] = useState(false);
  const [source, setSource] = useState<RewriteSource>("original");
  const [menu, setMenu] = useState<"inlineTags" | "tags" | "source" | "more" | "send" | null>(null);
  const [dialog, setDialog] = useState<"language" | "dictionary" | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [dictionaryWord, setDictionaryWord] = useState("");
  const [copied, setCopied] = useState(false);

  const noteRef = useRef<Note | null>(null);
  const activeRef = useRef<Version>("original");
  const titleRef = useRef("");
  const textRef = useRef("");
  const titleDirty = useRef(false);
  const textDirty = useRef(false);
  const textTarget = useRef<Version>("original");
  const savingCount = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  noteRef.current = note;
  activeRef.current = active;

  const applyServerNote = useCallback((next: Note) => {
    setNote(next);
    noteRef.current = next;
    const saving = savingCount.current > 0;
    if (!titleDirty.current && !saving) {
      setTitle(next.title);
      titleRef.current = next.title;
    }
    const version = activeRef.current;
    if (version !== "original" && !next.rewrites.some((rewrite) => rewrite.id === version)) {
      setActive("original");
      activeRef.current = "original";
      textDirty.current = false;
    }
    if (!textDirty.current && !saving) {
      const value = versionText(next, activeRef.current);
      setText(value);
      textRef.current = value;
      textTarget.current = activeRef.current;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<{ note: Note }>(`/api/notes/${noteId}`);
      applyServerNote(data.note);
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) setMissing(true);
      else setLoadError(errorMessage(error));
    }
  }, [applyServerNote, noteId]);

  const loadTags = useCallback(() => api<{ tags: Tag[] }>("/api/tags").then((data) => setTags(data.tags)).catch(() => undefined), []);
  const loadPrompts = useCallback(() => api<{ prompts: Prompt[] }>("/api/prompts").then((data) => setPrompts(data.prompts)).catch(() => undefined), []);

  useEffect(() => {
    const stashed = consumeReadyNote(noteId);
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    if (stashed) {
      applyServerNote(stashed.note);
      if (stashed.titlePending) {
        timers.push(setTimeout(() => void load(), 1600));
        timers.push(setTimeout(() => void load(), 4000));
      }
    } else {
      void load();
    }
    void loadTags();
    void loadPrompts();
    api<{ actions: IntegrationAction[] }>("/api/actions").then((data) => setActions(data.actions)).catch(() => undefined);

    const desktopMedia = window.matchMedia("(min-width: 1024px)");
    const syncLayout = () => setIsDesktop(desktopMedia.matches);
    syncLayout();
    setSidePanel(desktopMedia.matches ? "rewrite" : "closed");
    desktopMedia.addEventListener("change", syncLayout);
    return () => {
      timers.forEach(clearTimeout);
      desktopMedia.removeEventListener("change", syncLayout);
    };
  }, [applyServerNote, load, loadTags, loadPrompts, noteId]);

  const pollNeeded = Boolean(
    note && (note.status === "processing" || note.status === "uploading" || note.rewrites.some((rewrite) => rewrite.status === "processing" && !(rewrite.id in streaming))),
  );
  useEffect(() => {
    if (!pollNeeded) return;
    const id = setInterval(() => void load(), 650);
    return () => clearInterval(id);
  }, [pollNeeded, load]);

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const current = noteRef.current;
    if (!current || (!titleDirty.current && !textDirty.current)) return;
    const requests: Array<Promise<void>> = [];
    if (titleDirty.current) {
      titleDirty.current = false;
      const value = titleRef.current;
      requests.push(
        api<{ note: Note }>(`/api/notes/${current.id}`, { method: "PATCH", json: { title: value } })
          .then((data) => setNote((previous) => (previous ? { ...previous, title: data.note.title, updatedAt: data.note.updatedAt } : previous)))
          .catch((error: unknown) => {
            titleDirty.current = true;
            throw error;
          }),
      );
    }
    if (textDirty.current) {
      const target = textTarget.current;
      const value = textRef.current;
      textDirty.current = false;
      const restore = (error: unknown) => {
        if (textTarget.current === target) textDirty.current = true;
        throw error;
      };
      if (target === "original") {
        requests.push(
          api<{ note: Note }>(`/api/notes/${current.id}`, { method: "PATCH", json: { transcript: value } })
            .then((data) => setNote((previous) => (previous ? { ...previous, transcript: data.note.transcript, updatedAt: data.note.updatedAt } : previous)))
            .catch(restore),
        );
      } else if (value.trim()) {
        requests.push(
          api<{ rewrite: Rewrite }>(`/api/notes/${current.id}/rewrites/${target}`, { method: "PATCH", json: { text: value } })
            .then((data) =>
              setNote((previous) =>
                previous ? { ...previous, rewrites: previous.rewrites.map((rewrite) => (rewrite.id === data.rewrite.id ? data.rewrite : rewrite)) } : previous,
              ),
            )
            .catch(restore),
        );
      }
    }
    if (requests.length === 0) return;
    setSaveState("saving");
    savingCount.current += 1;
    const results = await Promise.allSettled(requests);
    savingCount.current -= 1;
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      setSaveState("error");
      toast(`Couldn't save changes: ${errorMessage((failed as PromiseRejectedResult).reason)}`, "error");
    } else {
      setSaveState("saved");
    }
  }, [toast]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 900);
  }, [flush]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (titleDirty.current || textDirty.current) {
        void flush();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
      void flush();
    };
  }, [flush]);

  function switchTo(version: Version, base: Note | null = noteRef.current) {
    void flush();
    setActive(version);
    activeRef.current = version;
    const value = base ? versionText(base, version) : "";
    setText(value);
    textRef.current = value;
    textTarget.current = version;
    textDirty.current = false;
    if (version === "original") setSource("original");
  }

  const replaceRewrite = useCallback((rewrite: Rewrite) => {
    setNote((previous) => {
      if (!previous) return previous;
      const exists = previous.rewrites.some((item) => item.id === rewrite.id);
      const next = {
        ...previous,
        rewrites: exists ? previous.rewrites.map((item) => (item.id === rewrite.id ? rewrite : item)) : [rewrite, ...previous.rewrites],
      };
      noteRef.current = next;
      return next;
    });
    if (activeRef.current === rewrite.id && !textDirty.current) {
      setText(rewrite.text);
      textRef.current = rewrite.text;
      textTarget.current = rewrite.id;
    }
  }, []);

  async function runRewrite(request: RewriteRequest, key: string, explicitSource?: number | null) {
    const current = noteRef.current;
    if (!current || busyKey) return;
    await flush();
    const sourceRewriteId =
      explicitSource !== undefined ? explicitSource : source === "current" && activeRef.current !== "original" ? activeRef.current : null;
    setBusyKey(key);
    let createdId: number | null = null;
    try {
      await postStream<Rewrite>(`/api/notes/${current.id}/rewrites`, { ...request, sourceRewriteId }, (event) => {
        if (event.type === "start" && event.rewrite) {
          const rewrite = event.rewrite;
          createdId = rewrite.id;
          setStreaming((map) => ({ ...map, [rewrite.id]: "" }));
          replaceRewrite(rewrite);
          switchTo(rewrite.id, { ...current, rewrites: [rewrite, ...current.rewrites] });
          if (!window.matchMedia("(min-width: 1024px)").matches) {
            setSidePanel("closed");
          }
        } else if (event.type === "delta" && createdId !== null && event.text) {
          const id = createdId;
          const piece = event.text;
          setStreaming((map) => ({ ...map, [id]: (map[id] ?? "") + piece }));
        } else if (event.type === "done" && event.rewrite) {
          replaceRewrite(event.rewrite);
          if (event.rewrite.error) toast(event.rewrite.error, "info");
        } else if (event.type === "error") {
          if (event.rewrite) replaceRewrite(event.rewrite);
          toast(event.error?.message || "Couldn't rewrite this note. Please try again.", "error");
        }
      });
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusyKey(null);
      if (createdId !== null) {
        const id = createdId;
        setStreaming((map) => {
          const next = { ...map };
          delete next[id];
          return next;
        });
      }
    }
  }

  function retryRewrite(rewrite: Rewrite) {
    const request: RewriteRequest | null =
      rewrite.kind === "translation" && rewrite.language
        ? { translateTo: rewrite.language }
        : rewrite.kind === "instruction" && rewrite.instruction
          ? { instruction: rewrite.instruction }
          : rewrite.promptId
            ? { promptId: rewrite.promptId }
            : null;
    if (!request) {
      toast("That style was removed, so this version can't be retried.", "error");
      return;
    }
    void (async () => {
      await api(`/api/notes/${noteId}/rewrites/${rewrite.id}`, { method: "DELETE" }).catch(() => undefined);
      setNote((previous) => (previous ? { ...previous, rewrites: previous.rewrites.filter((item) => item.id !== rewrite.id) } : previous));
      await runRewrite(request, "retry", rewrite.sourceRewriteId);
    })();
  }

  async function deleteVersion(rewrite: Rewrite) {
    if (rewrite.status === "ready") {
      const confirmed = await askConfirm({
        title: "Delete this version?",
        subject: rewrite.label,
        message: "This version will be permanently removed. This can't be undone.",
        confirmLabel: "Delete",
        tone: "danger",
        icon: Trash2,
      });
      if (!confirmed) return;
    }
    try {
      await api(`/api/notes/${noteId}/rewrites/${rewrite.id}`, { method: "DELETE" });
      if (activeRef.current === rewrite.id) switchTo("original");
      setNote((previous) => (previous ? { ...previous, rewrites: previous.rewrites.filter((item) => item.id !== rewrite.id) } : previous));
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function toggleFavorite(prompt: Prompt) {
    try {
      const data = await api<{ prompt: Prompt }>(`/api/prompts/${prompt.id}`, { method: "PATCH", json: { isFavorite: !prompt.isFavorite } });
      setPrompts((list) => list.map((item) => (item.id === prompt.id ? data.prompt : item)));
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function patchNote(json: Record<string, unknown>, success?: string) {
    try {
      const data = await api<{ note: Note }>(`/api/notes/${noteId}`, { method: "PATCH", json });
      setNote((previous) => (previous ? { ...previous, tags: data.note.tags, archived: data.note.archived, updatedAt: data.note.updatedAt } : previous));
      if (success) toast(success);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function transcribe(json: { mode: "pending" | "all"; language?: string; speakers?: boolean }, confirmation?: ConfirmOptions) {
    if (confirmation && !(await askConfirm(confirmation))) return;
    await flush();
    try {
      const data = await api<{ note: Note }>(`/api/notes/${noteId}/transcribe`, { json });
      textDirty.current = false;
      applyServerNote(data.note);
      if (json.mode === "all") switchTo("original", data.note);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function applyReplacementsNow() {
    setMenu(null);
    await flush();
    try {
      const rewriteId = activeRef.current === "original" ? null : activeRef.current;
      const data = await api<{ count: number; note: Note }>(`/api/notes/${noteId}/replacements`, { json: { rewriteId } });
      textDirty.current = false;
      applyServerNote(data.note);
      toast(data.count === 0 ? "Nothing to replace in this note." : `Updated ${data.count} phrase${data.count === 1 ? "" : "s"}.`);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function sendTo(action: IntegrationAction) {
    setMenu(null);
    await flush();
    try {
      await api(`/api/notes/${noteId}/actions`, { json: { actionId: action.id, rewriteId: activeRef.current === "original" ? null : activeRef.current } });
      toast(`Sent to ${action.title}`);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function addToDictionary() {
    const word = dictionaryWord.trim();
    if (!word) return;
    try {
      const data = await api<{ added: number }>("/api/dictionary", { json: { word } });
      toast(data.added ? `"${word}" added to your dictionary.` : `"${word}" is already in your dictionary.`);
      setDialog(null);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function deleteNote() {
    const confirmed = await askConfirm({
      title: "Delete this note?",
      subject: note?.title || "Untitled note",
      message: "Its audio and versions will be permanently removed. This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
      icon: Trash2,
    });
    if (!confirmed) return;
    try {
      titleDirty.current = false;
      textDirty.current = false;
      await api(`/api/notes/${noteId}`, { method: "DELETE" });
      toast("Note deleted");
      router.push("/");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(textRef.current);
      setCopied(true);
      toast("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      editorRef.current?.select();
      toast("Text selected — press Ctrl+C (or ⌘C) to copy.", "info");
    }
  }

  const activeRewrite = useMemo(
    () => (note && active !== "original" ? note.rewrites.find((rewrite) => rewrite.id === active) ?? null : null),
    [note, active],
  );

  if (missing) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-semibold">This note doesn&apos;t exist</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">It may have been deleted.</p>
        <Link href="/" className="btn btn-primary mt-5">
          Back to notes
        </Link>
      </div>
    );
  }
  if (!note) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        {loadError ? (
          <>
            <p className="alert alert-error">{loadError}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.2 }} role="status">
            <Spinner className="h-6 w-6 text-[var(--ink-muted)]" />
            <span className="sr-only">Loading note</span>
          </motion.div>
        )}
      </div>
    );
  }

  const processing = note.status === "processing";
  const hasAudio = note.audioFiles.length > 0;
  const pendingAudio = note.audioFiles.some((file) => file.status !== "ready");
  const rewriteRunning = activeRewrite?.status === "processing";
  const visibleText = activeRewrite && rewriteRunning ? streaming[activeRewrite.id] ?? activeRewrite.text : text;
  const editorReadOnly = (active === "original" && (processing || note.status === "uploading")) || rewriteRunning;
  const aiReady = Boolean(status?.configured);
  const canUseCurrent = Boolean(activeRewrite && activeRewrite.status === "ready");
  const rewriteDisabledReason = !aiReady
    ? "AI rewrites aren't connected right now."
    : !note.transcript.trim()
      ? processing
        ? "Rewrites unlock as soon as the transcript is ready."
        : "Add some text or record audio first."
      : busyKey
        ? "Finish the current rewrite first."
        : undefined;
  const panelOpen = sidePanel !== "closed";

  const tagMenuContent = (
    <>
      <div className="max-h-60 overflow-y-auto">
        {tags.length === 0 && <p className="px-3 py-2 text-xs text-[var(--ink-muted)]">No tags yet.</p>}
        {tags.map((tag) => {
          const on = note.tags.some((item) => item.id === tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className="menu-item"
              onClick={() =>
                void patchNote({
                  tagIds: on ? note.tags.filter((item) => item.id !== tag.id).map((item) => item.id) : [...note.tags.map((item) => item.id), tag.id],
                })
              }
            >
              <TagDot color={tag.color} className="h-2.5 w-2.5" />
              <span className="flex-1 truncate">{tag.title}</span>
              {on && <CheckCircleFilledIcon className="h-4 w-4 !text-[var(--brand)]" />}
            </button>
          );
        })}
      </div>
      <div className="menu-divider" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          setMenu(null);
          setTagModalOpen(true);
        }}
      >
        <TagIcon /> Manage tags
      </button>
    </>
  );

  const sidebarContent =
    sidePanel === "translate" ? (
      <TranslatePanel
        busy={busyKey === "translate"}
        disabled={Boolean(rewriteDisabledReason)}
        disabledReason={rewriteDisabledReason}
        onSelect={(code) => {
          void runRewrite({ translateTo: code }, "translate", activeRewrite && activeRewrite.status === "ready" ? activeRewrite.id : null);
          if (!isDesktop) setSidePanel("closed");
        }}
        onClose={() => setSidePanel("closed")}
      />
    ) : (
      <RewritePanel
        prompts={prompts}
        busyKey={busyKey}
        disabled={Boolean(rewriteDisabledReason)}
        disabledReason={rewriteDisabledReason}
        source={source}
        canUseCurrent={canUseCurrent}
        currentLabel={activeRewrite?.label ?? ""}
        onSourceChange={setSource}
        onRun={(request) => void runRewrite(request, "promptId" in request ? `prompt:${request.promptId}` : "instruction")}
        onToggleFavorite={(prompt) => void toggleFavorite(prompt)}
        onOpenGallery={() => setGalleryOpen(true)}
        onClose={() => setSidePanel("closed")}
      />
    );

  return (
    <div className="flex min-h-screen w-full overflow-x-clip bg-[var(--canvas)]">
      <main className="flex min-w-0 flex-1 flex-col items-center">
        <div className="sticky top-0 z-20 flex min-h-[3.875rem] w-full items-center justify-between border-b border-[var(--border)]/70 bg-[var(--canvas)]/88 px-5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={() => {
                void flush();
              }}
              aria-label="Back to notes"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
            >
              <BackArrowIcon className="h-5 w-5" />
            </Link>
            <div className="flex min-h-5 items-center text-xs text-[var(--ink-muted)]" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {saveState === "saving" && (
                  <motion.span
                    key="saving"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: EASE_OUT }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Spinner className="h-3 w-3" /> Saving…
                  </motion.span>
                )}
                {saveState === "saved" && (
                  <span key="saved" className="saved-fade inline-flex items-center gap-1 text-[var(--ink-muted)]">
                    <Check className="h-3.5 w-3.5 text-[var(--success)]" /> Saved
                  </span>
                )}
                {saveState === "error" && (
                  <button type="button" className="cursor-pointer text-[var(--danger)] underline" onClick={() => void flush()}>
                    Not saved · Retry
                  </button>
                )}
              </AnimatePresence>
            </div>
          </div>
          <span className="w-9" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SMOOTH}
          className="flex w-full max-w-[40.75rem] flex-1 flex-col px-5 pb-8 pt-7 sm:px-6 sm:pt-10"
        >
          {hasAudio && (
            <Accordion open={playerOpen}>
              <div className="pb-4">
                <AudioPlayer
                  noteId={note.id}
                  files={note.audioFiles}
                  autoPlay={playerAutoPlay}
                  onClose={() => {
                    setPlayerOpen(false);
                    setPlayerAutoPlay(false);
                  }}
                />
              </div>
            </Accordion>
          )}

          <div className="flex flex-wrap items-center gap-2.5 text-[0.9375rem]/5 font-semibold text-[var(--ink-muted)]">
            {hasAudio && !playerOpen && (
              <motion.button
                type="button"
                whileTap={TAP_PRESS}
                onClick={() => {
                  setPlayerAutoPlay(true);
                  setPlayerOpen(true);
                }}
                aria-label="Play note audio"
                className="inline-flex h-[1.875rem] w-[2.375rem] cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-panel)] text-[var(--ink)] transition-opacity hover:opacity-75"
              >
                <PlayTriangleIcon className="ml-0.5 h-3.5 w-3.5" />
              </motion.button>
            )}
            <time dateTime={new Date(note.createdAt).toISOString()}>{formatNoteTimestamp(note.createdAt)}</time>
            {hasAudio && note.language && note.language !== "auto" && (
              <span className="text-xs font-medium text-[var(--ink-muted)]">· {languageLabel(note.language)}</span>
            )}
            {note.speakers && (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                · <Users className="h-3 w-3" /> Speakers
              </span>
            )}
            {note.archived && (
              <span className="rounded-full bg-[var(--surface-panel)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink-subtle)]">
                Archived
              </span>
            )}
          </div>

          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              titleRef.current = event.target.value;
              titleDirty.current = true;
              scheduleSave();
            }}
            onBlur={() => void flush()}
            placeholder={processing ? "Title appears after transcription…" : "Untitled note"}
            aria-label="Note title"
            maxLength={200}
            className="mt-4 w-full bg-transparent text-[1.75rem]/[2.125rem] font-bold tracking-[-0.02em] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]/50"
          />

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 pl-2.5 pr-1.5 text-[0.875rem]/5 font-medium text-[var(--ink)]"
              >
                <TagDot color={tag.color} />
                {tag.title}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag.title}`}
                  onClick={() => void patchNote({ tagIds: note.tags.filter((item) => item.id !== tag.id).map((item) => item.id) })}
                  className="cursor-pointer rounded-full p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            <Popover
              open={menu === "inlineTags"}
              onClose={() => setMenu(null)}
              panelClassName="left-0 top-10 w-60"
              trigger={
                <button
                  type="button"
                  aria-label="Add tags"
                  aria-expanded={menu === "inlineTags"}
                  onClick={() => setMenu(menu === "inlineTags" ? null : "inlineTags")}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-[var(--border-strong)]/60 px-2.5 py-1 text-[0.8125rem]/[1.2] font-medium text-[var(--ink-muted)] transition-colors hover:border-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <Plus className="h-3.5 w-3.5" /> Tags
                </button>
              }
            >
              {tagMenuContent}
            </Popover>
          </div>

          {processing && (
            <div className="alert alert-info mt-5 space-y-2">
              <p className="flex items-center gap-2 font-medium">
                <Spinner className="h-4 w-4 text-[var(--brand)]" /> {note.stage || "Transcribing"}…
              </p>
              <ProgressBar value={note.progress ?? null} label="Transcription progress" />
              <p className="text-xs text-[var(--ink-muted)]">You can leave this page — your transcript will keep running.</p>
            </div>
          )}
          {note.status === "uploading" && hasAudio && (
            <div className="alert alert-warning mt-5 flex flex-wrap items-center gap-3">
              <span className="flex-1">This audio is saved and ready to transcribe.</span>
              <button type="button" className="btn btn-primary btn-sm" disabled={!aiReady} onClick={() => void transcribe({ mode: "pending" })}>
                Transcribe now
              </button>
            </div>
          )}
          {note.status === "failed" && (
            <div className="alert alert-error mt-5 flex flex-wrap items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{note.error || "Transcription couldn't finish."}</span>
              {hasAudio && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={!aiReady} onClick={() => void transcribe({ mode: pendingAudio ? "pending" : "all" })}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              )}
            </div>
          )}

          {note.rewrites.length > 0 && (
            <div role="tablist" aria-label="Versions" className="no-scrollbar mt-5 flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] pb-3">
              <button
                type="button"
                role="tab"
                aria-selected={active === "original"}
                onClick={() => switchTo("original")}
                className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  active === "original"
                    ? "border-transparent text-[var(--cta-ink)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                }`}
              >
                {active === "original" && (
                  <motion.span
                    layoutId="note-version-pill"
                    transition={SPRING_SNAPPY}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[var(--cta-bg)]"
                  />
                )}
                <span className="relative z-10">Original</span>
              </button>
              {note.rewrites.map((rewrite) => {
                const selected = active === rewrite.id;
                const Icon = rewrite.kind === "translation" ? Globe : rewrite.kind === "instruction" ? Wand2 : Sparkles;
                return (
                  <span
                    key={rewrite.id}
                    className={`relative inline-flex shrink-0 items-center gap-1 rounded-full border py-1.5 pl-3 pr-1.5 text-xs font-medium transition-colors duration-150 ${
                      selected
                        ? "border-transparent text-[var(--cta-ink)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="note-version-pill"
                        transition={SPRING_SNAPPY}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full bg-[var(--cta-bg)]"
                      />
                    )}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => switchTo(rewrite.id)}
                      className="relative z-10 inline-flex cursor-pointer items-center gap-1.5"
                    >
                      {rewrite.status === "processing" ? (
                        <Spinner className="h-3 w-3" />
                      ) : rewrite.status === "failed" ? (
                        <AlertCircle className="h-3 w-3 text-[var(--danger)]" />
                      ) : (
                        <Icon className="h-3 w-3" />
                      )}
                      <span className="max-w-[12rem] truncate">{rewrite.label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${rewrite.label}`}
                      onClick={() => void deleteVersion(rewrite)}
                      className="relative z-10 cursor-pointer rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <motion.div
            key={String(active)}
            initial={{ opacity: 0.45 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="flex flex-1 flex-col"
          >
            {activeRewrite?.status === "failed" ? (
              <div className="alert alert-error mt-5 flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">{activeRewrite.error || "Couldn't finish this rewrite."}</span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busyKey) || !aiReady} onClick={() => retryRewrite(activeRewrite)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              </div>
            ) : (
              <>
                {activeRewrite?.status === "ready" && activeRewrite.error && <p className="alert alert-warning mt-5">{activeRewrite.error}</p>}
                <textarea
                  ref={editorRef}
                  value={visibleText}
                  readOnly={editorReadOnly}
                  onChange={(event) => {
                    setText(event.target.value);
                    textRef.current = event.target.value;
                    textTarget.current = activeRef.current;
                    textDirty.current = true;
                    scheduleSave();
                  }}
                  onBlur={() => void flush()}
                  aria-label={active === "original" ? "Transcript" : `${activeRewrite?.label ?? "Rewrite"} text`}
                  placeholder={processing ? "Your transcript will appear here…" : rewriteRunning ? "Writing…" : "Start typing…"}
                  className="prose-note mt-5 min-h-[44vh] w-full flex-1 resize-none bg-transparent pb-[16vh] text-[1.0625rem]/[1.65] text-[var(--ink-body)] outline-none [field-sizing:content] placeholder:text-[var(--ink-muted)]/55"
                />
              </>
            )}
          </motion.div>
        </motion.div>

        <div className="sticky bottom-4 z-20 mb-4 flex items-center gap-2.5 rounded-[1.25rem] bg-[var(--canvas)]/65 px-3 py-2.5 backdrop-blur-lg">
          <motion.button
            type="button"
            whileTap={!visibleText.trim() ? undefined : TAP_ICON}
            onClick={() => void copyText()}
            disabled={!visibleText.trim()}
            aria-label="Copy text"
            title="Copy"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] transition-opacity duration-150 hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.14, ease: EASE_OUT }}
                  className="inline-flex"
                >
                  <Check className="h-5 w-5 text-[var(--success)]" />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.14, ease: EASE_OUT }}
                  className="inline-flex"
                >
                  <CopySquaresIcon className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <Popover
            open={menu === "tags"}
            onClose={() => setMenu(null)}
            panelClassName="bottom-14 left-0 w-60"
            trigger={
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                aria-label="Tags"
                title="Tags"
                aria-expanded={menu === "tags"}
                onClick={() => setMenu(menu === "tags" ? null : "tags")}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] transition-opacity duration-150 hover:opacity-75"
              >
                <HashThickIcon className="h-5 w-5" />
              </motion.button>
            }
          >
            {tagMenuContent}
          </Popover>

          <Popover
            open={menu === "source"}
            onClose={() => setMenu(null)}
            panelClassName="bottom-14 left-1/2 -translate-x-1/2 w-56"
            trigger={
              <div className="inline-flex h-12 items-center overflow-hidden rounded-2xl bg-[var(--cta-bg)] text-[var(--cta-ink)]">
                <button
                  type="button"
                  onClick={() => setSidePanel((cur) => (cur === "rewrite" ? "closed" : "rewrite"))}
                  className="inline-flex h-full cursor-pointer items-center gap-2 pl-5 pr-2.5 text-[0.9375rem] font-semibold transition-opacity hover:opacity-80"
                >
                  <SparklesFilledIcon className="h-[1.125rem] w-[1.125rem]" />
                  <span>Rewrite</span>
                </button>
                <button
                  type="button"
                  aria-label="Select rewrite source"
                  aria-expanded={menu === "source"}
                  onClick={() => setMenu(menu === "source" ? null : "source")}
                  className="flex h-full cursor-pointer items-center pr-4 pl-1.5 transition-opacity hover:opacity-70"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            }
          >
            <button
              type="button"
              className="menu-item justify-between"
              onClick={() => {
                setSource("original");
                setMenu(null);
              }}
            >
              <span>Original text</span>
              {source === "original" && <CheckCircleFilledIcon className="h-4 w-4 !text-[var(--ink)]" />}
            </button>
            <button
              type="button"
              disabled={!canUseCurrent}
              className="menu-item justify-between"
              onClick={() => {
                setSource("current");
                setMenu(null);
              }}
            >
              <span>Current version</span>
              {source === "current" && <CheckCircleFilledIcon className="h-4 w-4 !text-[var(--ink)]" />}
            </button>
          </Popover>

          <motion.button
            type="button"
            whileTap={Boolean(rewriteDisabledReason) || !visibleText.trim() ? undefined : TAP_ICON}
            disabled={Boolean(rewriteDisabledReason) || !visibleText.trim()}
            title={rewriteDisabledReason ?? "Translate"}
            aria-label="Translate"
            aria-pressed={sidePanel === "translate"}
            onClick={() => setSidePanel((cur) => (cur === "translate" ? "closed" : "translate"))}
            className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
              sidePanel === "translate"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:opacity-75"
            }`}
          >
            {busyKey === "translate" ? <Spinner className="h-5 w-5" /> : <TranslateDualIcon className="h-5 w-5" />}
          </motion.button>

          <Popover
            open={menu === "more"}
            onClose={() => setMenu(null)}
            panelClassName="bottom-14 right-0 w-[19rem] max-h-[70vh] overflow-y-auto"
            trigger={
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                aria-label="Note menu"
                title="More actions"
                aria-expanded={menu === "more"}
                onClick={() => setMenu(menu === "more" ? null : "more")}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] transition-opacity duration-150 hover:opacity-75"
              >
                <MoreDotsVerticalIcon className="h-5 w-5" />
              </motion.button>
            }
          >
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                const editor = editorRef.current;
                const selection = editor ? editor.value.slice(editor.selectionStart, editor.selectionEnd).trim() : "";
                setDictionaryWord(selection.slice(0, 60));
                setMenu(null);
                setDialog("dictionary");
              }}
            >
              <BookSolidIcon className="h-5 w-5 !text-[var(--ink)]" /> Add to Dictionary
            </button>
            <button type="button" className="menu-item" disabled={processing} onClick={() => router.push(`/record?append=${note.id}`)}>
              <MicSolidIcon className="h-5 w-5 !text-[var(--ink)]" /> Record more
            </button>
            <button type="button" className="menu-item" disabled={processing} onClick={() => router.push(`/record/upload?append=${note.id}`)}>
              <PaperclipClipIcon className="h-5 w-5 !text-[var(--ink)]" /> Add audio file
            </button>
            {hasAudio && (
              <a className="menu-item" href={`/api/notes/${note.id}/audio-export`} download onClick={() => setMenu(null)}>
                <ExportAudioSolidIcon className="h-5 w-5 !text-[var(--ink)]" /> Export audio
              </a>
            )}
            {hasAudio && (
              <>
                <button
                  type="button"
                  className="menu-item whitespace-nowrap"
                  disabled={processing || !aiReady}
                  onClick={() => {
                    setMenu(null);
                    setDialog("language");
                  }}
                >
                  <GlobeLangSolidIcon className="h-5 w-5 !text-[var(--ink)]" />
                  <span className="whitespace-nowrap">Speaker&apos;s language</span>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-[var(--ink-muted)]">
                    {languageLabel(note.language ?? status?.settings.defaultLanguage)}
                  </span>
                </button>
                {status?.speakersAvailable && (
                  <button
                    type="button"
                    className="menu-item"
                    disabled={processing || !aiReady}
                    onClick={() => {
                      setMenu(null);
                      void transcribe(
                        { mode: "all", speakers: !note.speakers },
                        note.speakers
                          ? {
                              title: "Remove speaker labels?",
                              message: "Your audio will be transcribed again without speaker labels. This replaces the current transcript.",
                              confirmLabel: "Transcribe again",
                              icon: Users,
                            }
                          : {
                              title: "Separate speakers?",
                              message: "Your audio will be transcribed again with speaker labels (Speaker A, Speaker B…). This replaces the current transcript.",
                              confirmLabel: "Transcribe again",
                              icon: Users,
                            },
                      );
                    }}
                  >
                    <SpeakersSolidIcon className="h-5 w-5 !text-[var(--ink)]" /> {note.speakers ? "Remove speaker labels" : "Separate speakers"}
                  </button>
                )}
              </>
            )}
            <button type="button" className="menu-item" onClick={() => setMenu("send")}>
              <BoltFilledIcon className="h-5 w-5 !text-[var(--ink)]" /> Actions
            </button>
            <button type="button" className="menu-item" onClick={() => void applyReplacementsNow()} disabled={editorReadOnly}>
              <ScissorsSolidIcon className="h-5 w-5 !text-[var(--ink)]" /> Text replacements
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setMenu(null);
                const label = activeRewrite ? ` (${activeRewrite.label})` : "";
                downloadBlob(
                  new Blob([`${title || "Untitled note"}${label}\n\n${textRef.current}\n`], { type: "text/plain;charset=utf-8" }),
                  `${slugify(title || "note")}${activeRewrite ? `-${slugify(activeRewrite.label)}` : ""}.txt`,
                );
              }}
            >
              <WriteNoteLinesIcon className="h-5 w-5 !text-[var(--ink)]" /> Download as text
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setMenu(null);
                void patchNote({ archived: !note.archived }, note.archived ? "Note restored from archive" : "Note archived");
              }}
            >
              <ArchiveBoxSolidIcon className="h-5 w-5 !text-[var(--ink)]" /> {note.archived ? "Restore" : "Archive"}
            </button>
            <button type="button" className="menu-item !text-[var(--danger)]" onClick={() => void deleteNote()}>
              <TrashFilledIcon className="h-5 w-5 !text-[var(--danger)]" /> Delete this note
            </button>
          </Popover>

          <Popover open={menu === "send"} onClose={() => setMenu(null)} panelClassName="bottom-14 right-0 w-64" trigger={<span />}>
            <p className="menu-label">Send {activeRewrite ? `"${activeRewrite.label}"` : "this note"} to</p>
            {actions.length === 0 && <p className="px-3 py-2 text-xs text-[var(--ink-muted)]">No connected apps yet.</p>}
            {actions.map((action) => (
              <button key={action.id} type="button" className="menu-item" onClick={() => void sendTo(action)}>
                <Send /> <span className="flex-1 truncate">{action.title}</span>
              </button>
            ))}
            <div className="menu-divider" />
            <Link href="/settings/actions" className="menu-item">
              Connect apps
            </Link>
          </Popover>
        </div>
      </main>

      <AnimatePresence initial={false}>
        {isDesktop && panelOpen && (
          <motion.aside
            key="desktop-side-panel"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "24.375rem" }}
            exit={{ opacity: 0, width: 0 }}
            transition={SIDE_PANEL_TRANSITION}
            className="sticky top-0 z-30 h-screen shrink-0 overflow-hidden border-l border-[var(--border)] bg-[var(--surface-panel)]"
          >
            <div className="h-full w-[24.375rem]">{sidebarContent}</div>
          </motion.aside>
        )}
      </AnimatePresence>

      <Drawer
        open={!isDesktop && panelOpen}
        onClose={() => setSidePanel("closed")}
        headerContent={null}
        ariaLabel={sidePanel === "translate" ? "Translate to" : "Rewrite options"}
      >
        {sidebarContent}
      </Drawer>

      <LanguageDialog
        open={dialog === "language"}
        title="Speaker's language"
        description="Re-transcribes this recording in the selected language while keeping your rewrites."
        includeAuto
        current={note.language}
        onClose={() => setDialog(null)}
        onPick={(code) => {
          setDialog(null);
          const language = findLanguage(code)?.name;
          const intro = language ? `Your audio will be transcribed again in ${language}.` : "Your audio will be transcribed again, with the language detected automatically.";
          void transcribe(
            { mode: "all", language: code },
            {
              title: "Transcribe again?",
              message: `${intro} This replaces the current transcript; your rewrites are kept.`,
              confirmLabel: "Transcribe again",
              icon: Languages,
            },
          );
        }}
      />

      <Dialog open={dialog === "dictionary"} onClose={() => setDialog(null)} title="Add to dictionary" centeredHeader size="sm">
        <div className="space-y-4">
          <div className="flex flex-col items-center text-center">
            <DictionaryIllustration className="h-12 w-12" />
            <p className="mt-2 text-xs text-[var(--ink-muted)]">Names and special terms saved here are spelled right in future transcripts.</p>
          </div>
          <input
            value={dictionaryWord}
            onChange={(event) => setDictionaryWord(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addToDictionary();
            }}
            maxLength={60}
            placeholder="e.g. Dr. Rahman, Saydraft"
            aria-label="Word or phrase"
            className="field rounded-full bg-[var(--surface-input)]"
          />
          <button type="button" className="btn btn-purple h-11 w-full rounded-2xl" disabled={!dictionaryWord.trim()} onClick={() => void addToDictionary()}>
            Add word
          </button>
        </div>
      </Dialog>

      <TagModal
        open={tagModalOpen}
        tags={tags}
        onClose={() => setTagModalOpen(false)}
        onChanged={() => {
          void loadTags();
          void load();
        }}
      />

      <GalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} onInstalled={() => void loadPrompts()} />
    </div>
  );
}
