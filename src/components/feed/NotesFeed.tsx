"use client";

import Link, { useLinkStatus } from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, LifeBuoy, Mic, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateGroup } from "@/lib/format";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import type { NoteListItem, SortMode, Tag } from "@/lib/types";
import {
  ArchiveBoxIllustration,
  ArchiveBoxSolidIcon,
  CheckCircleFilledIcon,
  HashThickIcon,
  HexSettingsIcon,
  MeetingWaveIcon,
  MergeDocsIcon,
  PaperclipClipIcon,
  PencilSolidIcon,
  PlusThinIcon,
  SearchLoopIcon,
  SortArrowsIcon,
  TrashFilledIcon,
  WriteNoteLinesIcon,
} from "../icons";
import { useRecoverableSessions } from "../record/RecoveryPanel";
import { GalleryModal } from "../settings/GallerySection";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { useAppStatus } from "../StatusProvider";
import { TagModal } from "../TagManager";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { CuteMicIcon, Popover, Spinner, TagDot } from "../ui";
import { DashboardBackdrop } from "./DashboardBackdrop";
import { MergeDialog } from "./MergeDialog";
import { NoteCard } from "./NoteCard";

type Filter = { kind: "all" } | { kind: "unsorted" } | { kind: "archive" } | { kind: "tag"; tagId: number };

interface FeedView {
  key: string;
  filter: Filter;
  sortBy: SortMode;
  query: string;
}

interface FeedResult {
  view: FeedView;
  notes: NoteListItem[];
}

const EMPTY_NOTES: NoteListItem[] = [];
const SORT_KEY = "saydraft-sort";
const FILTER_KEY = "saydraft-filter";
const GALLERY_BANNER_KEY = "saydraft-gallery-banner-dismissed";

function filterKey(filter: Filter) {
  return filter.kind === "tag" ? `tag-${filter.tagId}` : filter.kind;
}

function OpeningNote() {
  const { pending } = useLinkStatus();
  return (
    <span className="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center" role="status">
      {pending && (
        <>
          <span className="sr-only">Opening…</span>
          <Spinner className="h-4 w-4 motion-reduce:animate-none" />
        </>
      )}
    </span>
  );
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function NotesFeed() {
  const toast = useToast();
  const askConfirm = useConfirm();
  const { status, offline, refresh: refreshStatus } = useAppStatus();
  const { sessions: unsaved } = useRecoverableSessions();

  const [result, setResult] = useState<FeedResult | null>(null);
  const [recentResults, setRecentResults] = useState<Record<string, FeedResult>>({});
  const [tags, setTags] = useState<Tag[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [sortBy, setSortBy] = useState<SortMode>("updatedAt");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [menu, setMenu] = useState<"sort" | "plus" | "bulkTag" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [galleryBanner, setGalleryBanner] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterNavRef = useRef<HTMLElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestedView = useRef<FeedView | null>(null);

  const view = useMemo<FeedView>(() => {
    const params = new URLSearchParams({ sortBy, filter: filter.kind });
    if (filter.kind === "tag") params.set("tagId", String(filter.tagId));
    if (debounced) params.set("q", debounced);
    return { key: params.toString(), filter, sortBy, query: debounced };
  }, [debounced, filter, sortBy]);

  const filterChanging = result !== null && filterKey(result.view.filter) !== filterKey(filter);
  const visibleResult = useMemo(() => {
    if (!filterChanging || !result) return result;
    if (recentResults[view.key]) return recentResults[view.key];
    // Unsorted is a subset of the same non-archived notes, so it can be shown before the server replies.
    if (view.filter.kind === "unsorted" && result.view.filter.kind === "all" &&
        result.view.query === view.query && result.view.sortBy === view.sortBy) {
      return { view, notes: result.notes.filter((note) => note.tags.length === 0) };
    }
    return null;
  }, [filterChanging, recentResults, result, view]);
  const notes = visibleResult?.notes ?? EMPTY_NOTES;
  const displayedFilter = visibleResult?.view.filter ?? filter;
  const displayedSort = visibleResult?.view.sortBy ?? sortBy;
  const displayedQuery = visibleResult?.view.query ?? debounced;
  const filterPending = filterChanging && !loadError;

  useEffect(() => {
    if (readStorage(SORT_KEY) === "createdAt") setSortBy("createdAt");
    const savedFilter = readStorage(FILTER_KEY);
    if (savedFilter) {
      try {
        setFilter(JSON.parse(savedFilter) as Filter);
      } catch {
        // ignore
      }
    }
    setGalleryBanner(readStorage(GALLERY_BANNER_KEY) !== "1");
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeStorage(SORT_KEY, sortBy);
    writeStorage(FILTER_KEY, JSON.stringify(filter));
  }, [sortBy, filter, restored]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(id);
  }, [query]);

  const loadTags = useCallback(async () => {
    try {
      const data = await api<{ tags: Tag[] }>("/api/tags");
      setTags(data.tags);
      setFilter((current) => (current.kind === "tag" && !data.tags.some((tag) => tag.id === current.tagId) ? { kind: "all" } : current));
    } catch {
      // handled by notes loader
    }
  }, []);

  useLayoutEffect(() => {
    requestedView.current = view;
    return () => {
      requestedView.current = null;
      requestRef.current?.abort();
    };
  }, [view]);

  const loadNotes = useCallback(async (quiet = false) => {
    const requested = requestedView.current;
    if (!requested) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const data = await api<{ notes: NoteListItem[] }>(`/api/notes?${requested.key}`, { signal: controller.signal });
      if (controller.signal.aborted) return;

      const nextResult = { view: requested, notes: data.notes };
      setResult(nextResult);
      // Keep at most the standard filters for each sort; searches and individual tags are not cached.
      if (!requested.query && requested.filter.kind !== "tag") {
        setRecentResults((current) => ({ ...current, [requested.key]: nextResult }));
      }
      setLoadError(null);
      setSelectedIds((current) => {
        if (current.length === 0) return current;
        const visible = new Set(data.notes.map((note) => note.id));
        const next = current.filter((id) => visible.has(id));
        return next.length === current.length ? current : next;
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(errorMessage(error));
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);
  useEffect(() => {
    if (restored) void loadNotes();
  }, [loadNotes, restored, view]);

  const anyBusy = notes.some((note) => note.status === "processing" || note.status === "uploading" || note.rewritesProcessing > 0);
  useEffect(() => {
    if (!anyBusy) return;
    const id = setInterval(() => {
      if (!requestRef.current) void loadNotes(true);
    }, 1200);
    return () => clearInterval(id);
  }, [anyBusy, loadNotes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 20);
      } else if (event.key === "Escape" && !menu) {
        if (selectedIds.length > 0) setSelectedIds([]);
        else if (searchOpen) {
          setQuery("");
          setSearchOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, searchOpen, selectedIds.length]);

  const groups = useMemo(() => {
    const grouped: Array<{ key: string; primary: string; secondary?: string; isToday: boolean; items: NoteListItem[] }> = [];
    const index = new Map<string, (typeof grouped)[number]>();
    for (const note of notes) {
      const bucket = formatDateGroup(displayedSort === "createdAt" ? note.createdAt : note.updatedAt);
      let entry = index.get(bucket.key);
      if (!entry) {
        entry = { ...bucket, items: [] };
        index.set(bucket.key, entry);
        grouped.push(entry);
      }
      entry.items.push(note);
    }
    return grouped;
  }, [notes, displayedSort]);

  const selecting = selectedIds.length > 0;
  const selectionIndex = useMemo(() => new Map(selectedIds.map((id, i) => [id, i + 1])), [selectedIds]);
  const selectedNotes = useMemo(() => {
    const set = new Set(selectedIds);
    return notes.filter((note) => set.has(note.id));
  }, [notes, selectedIds]);

  function toggle(id: number) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectAll() {
    if (selectedIds.length === notes.length) setSelectedIds([]);
    else setSelectedIds(notes.map((n) => n.id));
  }

  async function bulk(action: "archive" | "unarchive" | "delete" | "tag" | "untag", tagId?: number) {
    const ids = [...selectedIds];
    if (action === "delete") {
      const many = ids.length !== 1;
      const only = many ? undefined : notes.find((note) => note.id === ids[0]);
      const confirmed = await askConfirm({
        title: many ? `Delete ${ids.length} notes?` : "Delete this note?",
        subject: only ? only.title || "Untitled note" : undefined,
        message: many
          ? "They will be permanently deleted, along with their audio. This can't be undone."
          : "It will be permanently deleted, along with its audio. This can't be undone.",
        confirmLabel: "Delete",
        tone: "danger",
        icon: Trash2,
      });
      if (!confirmed) return;
    }
    setBulkBusy(true);
    try {
      await api("/api/notes/bulk", { json: { action, ids, tagId } });
      setRecentResults({});
      const verb = { archive: "Archived", unarchive: "Restored", delete: "Deleted", tag: "Tagged", untag: "Removed tag from" }[action];
      toast(`${verb} ${ids.length} note${ids.length === 1 ? "" : "s"}`);
      if (action !== "tag" && action !== "untag") setSelectedIds([]);
      setMenu(null);
      await Promise.all([loadNotes(true), loadTags()]);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBulkBusy(false);
    }
  }

  function selectFilter(next: Filter) {
    setFilter(next);
    setSelectedIds([]);
    setLoadError(null);
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  }

  const filterTabs: Array<{ value: Filter; label: string; color?: string }> = [
    { value: { kind: "all" }, label: "All" },
    { value: { kind: "unsorted" }, label: "Unsorted" },
    ...tags.map((tag) => ({
      value: { kind: "tag" as const, tagId: tag.id },
      label: tag.title,
      color: tag.color,
    })),
    { value: { kind: "archive" }, label: "Archive" },
  ];
  const activeFilter = filterKey(filter);
  const pendingLabel = filter.kind === "all"
    ? "Loading notes…"
    : `Loading ${filterTabs.find((tab) => filterKey(tab.value) === activeFilter)?.label ?? "notes"}…`;

  const emptyMessage = displayedQuery
    ? { title: "No matching notes", body: `Nothing matched "${displayedQuery}" in your notes or rewrites.` }
    : displayedFilter.kind === "archive"
      ? { title: "Archive", body: "Archive notes from the selection bar or a note's menu to keep them here." }
      : displayedFilter.kind === "unsorted"
        ? { title: "All caught up", body: "Notes without tags show up here." }
        : displayedFilter.kind === "tag"
          ? { title: "No notes with this tag", body: "Add this tag inside any note to organize it here." }
          : { title: "Capture your first thought", body: "Record a voice note, upload audio, or start writing." };

  const searchActive = (searchOpen || Boolean(debounced)) && !selecting;

  return (
    <div className="notes-feed relative flex min-h-screen w-full flex-col px-5 pb-[7.375rem] pt-3 sm:px-8 xl:px-16">
      <DashboardBackdrop />
      <header className="sticky top-3 z-20 mb-8 sm:mb-10">
        <div className="mx-auto flex w-full max-w-[44.25rem] items-center justify-center gap-2">
          <Popover
            open={menu === "sort"}
            onClose={() => setMenu(null)}
            panelClassName="left-0 top-13 w-[14.5rem]"
            trigger={
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => setMenu(menu === "sort" ? null : "sort")}
                aria-label="Sort by"
                aria-expanded={menu === "sort"}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[var(--border)]/70 bg-[var(--surface-panel)]/90 text-[var(--ink)] shadow-xs backdrop-blur-md transition-opacity hover:opacity-70"
              >
                <SortArrowsIcon className="h-5 w-5" />
              </motion.button>
            }
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--border)]/60 px-3.5 pb-2.5 pt-2 text-[0.9375rem] font-medium text-[var(--ink-subtle)]">
              <SortArrowsIcon className="h-4 w-4" />
              <span>Sort by:</span>
            </div>
            <div className="pt-1">
              {(
                [
                  ["updatedAt", "Last updated"],
                  ["createdAt", "Creation date"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setSortBy(value);
                    setMenu(null);
                  }}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {sortBy === value && <CheckCircleFilledIcon className="h-5 w-5 !text-[var(--ink)]" />}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </Popover>

          <div className="flex w-fit max-w-[calc(100%-6.75rem)] items-center rounded-full border border-[var(--border)]/70 bg-[var(--surface-panel)]/90 px-1.5 shadow-xs backdrop-blur-md sm:px-2">
            <nav ref={filterNavRef} aria-label="Filter notes" className="no-scrollbar flex items-center overflow-x-auto">
              {filterTabs.map((tab) => {
                const key = filterKey(tab.value);
                const active = key === activeFilter;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={active ? undefined : () => selectFilter(tab.value)}
                    className="relative mx-1.5 flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 py-2 text-[0.875rem]/5 font-semibold text-[var(--ink)] transition-opacity hover:opacity-60 active:opacity-60 sm:mx-2.5 sm:text-[0.9375rem]/5"
                  >
                    {tab.color && <TagDot color={tab.color} />}
                    <span>{tab.label}</span>
                    {active && (
                      <motion.span
                        layoutId="feed-filter-underline"
                        transition={SPRING_SNAPPY}
                        aria-hidden="true"
                        className="absolute bottom-1 left-0 right-0 h-[3px] rounded-t-full bg-[var(--ink)]"
                      />
                    )}
                  </button>
                );
              })}
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => setTagModalOpen(true)}
                aria-label="Edit tags"
                className="ml-0.5 flex h-9 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-subtle)] transition-opacity hover:opacity-60"
              >
                <PencilSolidIcon className="h-4 w-4" />
              </motion.button>
            </nav>
            <button
              type="button"
              aria-label="Scroll filters"
              onClick={() => filterNavRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
              className="ml-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] sm:hidden"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <motion.button
            type="button"
            whileTap={TAP_ICON}
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[var(--border)]/70 bg-[var(--surface-panel)]/90 text-[var(--ink)] shadow-xs backdrop-blur-md transition-opacity hover:opacity-70"
          >
            <HexSettingsIcon className="h-6 w-6" />
          </motion.button>
        </div>
        <div role="status" className="pointer-events-none absolute inset-x-0 top-full mt-1.5 text-center text-xs text-[var(--ink-muted)]">
          {(filterPending || (!result && !loadError)) && <span key={activeFilter} className="pending-hint rounded-full bg-[var(--canvas)] px-2">{pendingLabel}</span>}
        </div>
      </header>

      <div className="relative z-10 space-y-3">
        {offline && (
          <div className="alert alert-error flex flex-wrap items-center justify-between gap-2">
            <span>Unable to connect right now. Check your connection and try again.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refreshStatus()}>
              Retry
            </button>
          </div>
        )}
        {status && !status.configured && (
          <div className="alert alert-warning flex flex-wrap items-center justify-between gap-2">
            <span>Voice transcription and AI rewrites aren&apos;t connected yet. You can still write, search, and organize notes.</span>
            <Link href="/settings/preferences" className="btn btn-secondary btn-sm">
              Check settings
            </Link>
          </div>
        )}
        {unsaved.length > 0 && (
          <Link href="/record?recover=1" className="alert alert-warning flex items-center gap-2.5 transition-opacity hover:opacity-85">
            <LifeBuoy className="h-4 w-4 shrink-0 text-[var(--warning)]" />
            <span className="flex-1">
              {unsaved.length === 1
                ? "You have an unsaved recording waiting to be recovered."
                : `You have ${unsaved.length} unsaved recordings waiting to be recovered.`}{" "}
              Open recorder
            </span>
          </Link>
        )}
      </div>

      <main aria-busy={loading || filterPending} className="relative z-10 flex flex-1 flex-col">
        <AnimatePresence initial={false}>
          {galleryBanner && !displayedQuery && (
            <motion.div
              key="gallery-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="pb-8">
                <article className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[2rem] bg-[var(--sky-banner)] p-6 text-[#01050f] sm:p-8 md:flex-row">
                  <div className="flex flex-1 flex-col items-start justify-center gap-2 self-stretch">
                    <h2 className="text-[1.875rem]/[1.15] font-bold tracking-tight sm:text-[2.125rem]">
                      Rewrite options gallery
                    </h2>
                    <p className="max-w-xs text-[0.9375rem]/5 text-[#01050f]/80">
                      Discover, customize, and save your favorite rewrite options.
                    </p>
                    <button
                      type="button"
                      onClick={() => setGalleryOpen(true)}
                      className="btn-purple mt-2 inline-flex min-h-11 min-w-[9.5rem] cursor-pointer items-center justify-center rounded-xl px-6 py-2.5 text-[0.9375rem] font-semibold transition-[opacity,transform] duration-150 active:scale-[0.97]"
                    >
                      Discover
                    </button>
                  </div>

                  <div aria-hidden="true" className="flex w-full flex-[1.4] items-center justify-center md:justify-end">
                    <div className="w-full max-w-[23rem] rounded-full bg-white/30 px-5 py-4 sm:w-auto sm:max-w-none sm:px-7 sm:py-5">
                      <div className="mx-auto w-full max-w-[21rem] rounded-2xl bg-[#181429] p-4 text-[#fef8fb] shadow-xl">
                        <p className="text-center text-xs font-semibold text-white/85">Rewrite Options Gallery</p>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] text-white/80">
                          {[
                            ["Text Editing", "bg-violet-500/25 text-violet-200", "T"],
                            ["Emails", "bg-emerald-500/25 text-emerald-200", "@"],
                            ["Journaling", "bg-amber-500/25 text-amber-200", "J"],
                            ["Work", "bg-sky-500/25 text-sky-200", "W"],
                          ].map(([catLabel, badgeCls, sym]) => (
                            <div key={catLabel} className="rounded-xl bg-white/8 p-2">
                              <span className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-lg font-bold ${badgeCls}`}>
                                {sym}
                              </span>
                              <span className="block truncate">{catLabel}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-gradient-to-br from-amber-300/90 to-orange-400/90 p-2.5 text-[#01050f]">
                            <span className="text-[11px] font-bold">Meeting Notes</span>
                            <span className="mt-0.5 block text-[10px] opacity-75">Key decisions &amp; steps</span>
                          </div>
                          <div className="rounded-xl bg-gradient-to-br from-rose-300/90 to-violet-400/90 p-2.5 text-[#01050f]">
                            <span className="text-[11px] font-bold">Polite Email</span>
                            <span className="mt-0.5 block text-[10px] opacity-75">Ready to send</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    whileTap={TAP_ICON}
                    aria-label="Close banner"
                    onClick={() => {
                      setGalleryBanner(false);
                      writeStorage(GALLERY_BANNER_KEY, "1");
                    }}
                    className="absolute right-3.5 top-3.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#01050f]/15 text-[#01050f]/75 transition-opacity hover:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                  </motion.button>
                </article>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loadError ? (
          <div className="alert alert-error flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadNotes()}>
              Try again
            </button>
          </div>
        ) : !visibleResult ? (
          <div key={activeFilter} aria-hidden="true" className="view-enter mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="surface-card h-[14.5rem] rounded-[1.75rem] opacity-65" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div
            key={`empty-${visibleResult.view.key}`}
            className="view-enter mx-auto my-auto max-w-md rounded-[2rem] border border-[var(--border)]/70 bg-[var(--surface)]/84 px-8 py-12 text-center shadow-xs backdrop-blur-md"
          >
            {displayedFilter.kind === "archive" ? (
              <ArchiveBoxIllustration className="mx-auto mb-4 h-24 w-24" />
            ) : (
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-panel)] text-[var(--brand)]">
                <Mic className="h-7 w-7" />
              </span>
            )}
            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)]">{emptyMessage.title}</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-[0.9375rem] text-[var(--ink-subtle)]">{emptyMessage.body}</p>
            {displayedFilter.kind === "all" && !displayedQuery && (
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <Link href="/record" className="btn btn-primary">
                  <Mic className="h-4 w-4" /> Record voice note
                </Link>
                <Link href="/notes/new" prefetch className="btn btn-secondary">
                  Write a note <OpeningNote />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div key={filterKey(displayedFilter)} className="view-enter space-y-10">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.secondary ? `${group.primary} ${group.secondary}` : group.primary}>
                <h2
                  className={`dashboard-heading mb-5 font-semibold ${
                    group.isToday
                      ? "text-[2.75rem]/[3.25rem] tracking-[-0.025em] sm:text-[3rem]/[3.5rem]"
                      : "text-[1.75rem]/[2.25rem] tracking-[-0.02em] sm:text-[2rem]/[2.625rem]"
                  }`}
                >
                  <span className="text-[var(--ink)]">{group.primary}</span>
                  {group.secondary && (
                    <>
                      {" "}
                      <span className="block text-[var(--ink-subtle)] sm:inline">{group.secondary}</span>
                    </>
                  )}
                </h2>
                <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {group.items.map((note) => (
                      <motion.li
                        key={note.id}
                        layout="position"
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={SPRING_SMOOTH}
                      >
                        <NoteCard
                          note={note}
                          sortBy={displayedSort}
                          selectionOrder={selectionIndex.get(note.id) ?? null}
                          selecting={selecting}
                          onToggleSelect={() => toggle(note.id)}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <AnimatePresence mode="wait" initial={false}>
          {selecting ? (
            <motion.div
              key="bulk-dock"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="frosted-dock pointer-events-auto relative flex max-w-full items-center gap-1 rounded-[1.75rem] bg-[var(--surface)]/95 px-2.5 py-1.5 dark:bg-[#302a43]/90"
            >
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex h-[3.375rem] min-w-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-2xl px-3 text-[var(--ink)] transition-opacity hover:opacity-65"
              >
                <span className="text-[1.125rem]/5 font-bold tabular-nums">{selectedIds.length}</span>
                <span className="mt-1 text-[11px] font-medium text-[var(--ink-subtle)]">Selected</span>
              </button>

              <Popover
                open={menu === "bulkTag"}
                onClose={() => setMenu(null)}
                panelClassName="bottom-16 left-0 max-h-72 w-56 overflow-y-auto"
                trigger={
                  <button
                    type="button"
                    disabled={bulkBusy || tags.length === 0}
                    onClick={() => setMenu(menu === "bulkTag" ? null : "bulkTag")}
                    className="flex h-[3.375rem] min-w-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-2xl px-3 text-[var(--ink)] transition-opacity hover:opacity-65 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <HashThickIcon className="h-5 w-5" />
                    <span className="mt-1 text-[11px] font-medium">Add tags</span>
                  </button>
                }
              >
                <p className="menu-label">Add tags</p>
                {tags.map((tag) => {
                  const all = selectedNotes.length > 0 && selectedNotes.every((note) => note.tags.some((item) => item.id === tag.id));
                  return (
                    <button key={tag.id} type="button" className="menu-item" onClick={() => void bulk(all ? "untag" : "tag", tag.id)}>
                      <TagDot color={tag.color} className="h-2.5 w-2.5" />
                      <span className="flex-1 truncate">{tag.title}</span>
                      {all && <CheckCircleFilledIcon className="h-4 w-4 !text-[var(--brand)]" />}
                    </button>
                  );
                })}
              </Popover>

              <button
                type="button"
                disabled={bulkBusy || selectedIds.length < 2}
                onClick={() => setMergeOpen(true)}
                className="relative flex h-[3.375rem] min-w-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-2xl px-3 text-[var(--ink)] transition-opacity hover:opacity-65 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--brand)] px-2 py-[1px] text-[10px] font-semibold text-white shadow-xs">
                  New
                </span>
                <MergeDocsIcon className="h-5 w-5" />
                <span className="mt-1 text-[11px] font-medium">Merge</span>
              </button>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulk(displayedFilter.kind === "archive" ? "unarchive" : "archive")}
                className="flex h-[3.375rem] min-w-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-2xl px-3 text-[var(--ink)] transition-opacity hover:opacity-65 disabled:opacity-40"
              >
                <ArchiveBoxSolidIcon className="h-5 w-5" />
                <span className="mt-1 text-[11px] font-medium">{displayedFilter.kind === "archive" ? "Restore" : "Archive"}</span>
              </button>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulk("delete")}
                className="flex h-[3.375rem] min-w-[4.75rem] cursor-pointer flex-col items-center justify-center rounded-2xl px-3 text-[var(--danger)] transition-opacity hover:opacity-70 disabled:opacity-40"
              >
                <TrashFilledIcon className="h-5 w-5" />
                <span className="mt-1 text-[11px] font-medium tabular-nums">Remove ({selectedIds.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="flex h-[3.375rem] min-w-[4.25rem] cursor-pointer flex-col items-center justify-center rounded-2xl px-3 text-[var(--ink)] transition-opacity hover:opacity-65"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--cta-ink)]">
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span className="mt-1 text-[11px] font-medium">Cancel</span>
              </button>
            </motion.div>
          ) : searchActive ? (
            <motion.div
              key="search-dock"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="pointer-events-auto flex items-center gap-2.5"
            >
              <div className="frosted-dock flex h-[3.875rem] w-[min(20rem,calc(100vw-6.5rem))] items-center gap-2.5 rounded-full !border-2 !border-[var(--brand)] px-5">
                <SearchLoopIcon className="h-5 w-5 shrink-0 text-[var(--ink-muted)]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setQuery("");
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search notes…"
                  aria-label="Search notes"
                  className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
                />
                {loading && debounced && <Spinner className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />}
              </div>
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
                aria-label="Close search"
                className="frosted-dock flex h-[3.875rem] w-[3.875rem] cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <X className="h-5 w-5" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="main-dock"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="frosted-dock pointer-events-auto flex h-16 items-center gap-1.5 rounded-full px-1.5"
            >
              <Popover
                open={menu === "plus"}
                onClose={() => setMenu(null)}
                panelClassName="bottom-16 left-0 w-56"
                trigger={
                  <motion.button
                    type="button"
                    whileTap={TAP_ICON}
                    onClick={() => setMenu(menu === "plus" ? null : "plus")}
                    aria-label="More ways to create a note"
                    aria-expanded={menu === "plus"}
                    className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-55"
                  >
                    <motion.span animate={{ rotate: menu === "plus" ? 45 : 0 }} transition={SPRING_SNAPPY} className="inline-flex">
                      <PlusThinIcon className="h-5 w-5" />
                    </motion.span>
                  </motion.button>
                }
              >
                <Link href="/notes/new" prefetch className="menu-item">
                  <WriteNoteLinesIcon className="h-5 w-5" /> Write note <OpeningNote />
                </Link>
                <Link href="/record/upload" prefetch className="menu-item">
                  <PaperclipClipIcon className="h-5 w-5" /> Upload audio <OpeningNote />
                </Link>
                <Link href="/record?mode=meeting" className="menu-item" onClick={() => setMenu(null)}>
                  <MeetingWaveIcon className="h-5 w-5" /> Record meeting
                </Link>
              </Popover>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={TAP_PRESS} transition={SPRING_SNAPPY}>
                <Link
                  href="/record"
                  aria-label="Record a voice note"
                  className="flex h-[3.375rem] w-[7.5rem] items-center justify-center rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] transition-opacity duration-150 hover:opacity-85"
                >
                  <CuteMicIcon className="h-10 w-10" />
                </Link>
              </motion.div>

              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchRef.current?.focus(), 20);
                }}
                aria-label="Search notes"
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-55"
              >
                <SearchLoopIcon className="h-5 w-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenTags={() => setTagModalOpen(true)}
        onOpenGallery={() => setGalleryOpen(true)}
      />
      <TagModal
        open={tagModalOpen}
        tags={tags}
        onClose={() => setTagModalOpen(false)}
        onChanged={() => {
          setRecentResults({});
          void loadTags();
          void loadNotes(true);
        }}
      />
      <GalleryModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
      <MergeDialog open={mergeOpen} notes={selectedNotes} onClose={() => setMergeOpen(false)} />
    </div>
  );
}
