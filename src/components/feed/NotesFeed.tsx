"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  BookOpen,
  Briefcase,
  Check,
  FileText,
  LifeBuoy,
  Mail,
  Merge,
  Mic,
  MonitorSpeaker,
  Pencil,
  Plus,
  Search,
  Settings,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateHeading } from "@/lib/format";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY, TAP_ICON, TAP_PRESS } from "@/lib/motion";
import type { NoteListItem, SortMode, Tag } from "@/lib/types";
import { useRecoverableSessions } from "../record/RecoveryPanel";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { useAppStatus } from "../StatusProvider";
import { TagModal } from "../TagManager";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { Accordion, CuteMicIcon, Popover, Spinner, TagDot } from "../ui";
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

function renderDateHeading(heading: string) {
  const splitAt = heading.indexOf(", ");
  if (splitAt === -1) return <span className="text-[var(--ink)]">{heading}</span>;
  const first = heading.slice(0, splitAt + 1);
  const rest = heading.slice(splitAt + 2);
  return (
    <>
      <span className="text-[var(--ink)]">{first}</span>{" "}
      <span className="text-[var(--ink-muted)]">{rest}</span>
    </>
  );
}

export function NotesFeed() {
  const toast = useToast();
  const askConfirm = useConfirm();
  const { status, offline, refresh: refreshStatus } = useAppStatus();
  const { sessions: unsaved } = useRecoverableSessions();

  const [result, setResult] = useState<FeedResult | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [sortBy, setSortBy] = useState<SortMode>("updatedAt");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<"sort" | "plus" | "bulkTag" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [galleryBanner, setGalleryBanner] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestedView = useRef<FeedView | null>(null);

  const view = useMemo<FeedView>(() => {
    const params = new URLSearchParams({ sortBy, filter: filter.kind });
    if (filter.kind === "tag") params.set("tagId", String(filter.tagId));
    if (debounced) params.set("q", debounced);
    return { key: params.toString(), filter, sortBy, query: debounced };
  }, [debounced, filter, sortBy]);

  const notes = result?.notes ?? EMPTY_NOTES;
  const displayedFilter = result?.view.filter ?? filter;
  const displayedSort = result?.view.sortBy ?? sortBy;
  const displayedQuery = result?.view.query ?? debounced;

  // Restore saved view preferences once.
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
      // The notes request reports connection problems.
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
    if (!quiet) setLoading(true);

    try {
      const data = await api<{ notes: NoteListItem[] }>(`/api/notes?${requested.key}`, { signal: controller.signal });
      if (controller.signal.aborted) return;

      setResult({ view: requested, notes: data.notes });
      setLoadError(null);
      setSelected((current) => {
        if (current.size === 0) return current;
        const visible = new Set(data.notes.map((note) => note.id));
        const next = new Set([...current].filter((id) => visible.has(id)));
        return next.size === current.size ? current : next;
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

  // Keep processing notes fresh.
  const anyBusy = notes.some((note) => note.status === "processing" || note.status === "uploading" || note.rewritesProcessing > 0);
  useEffect(() => {
    if (!anyBusy) return;
    const id = setInterval(() => {
      if (!requestRef.current) void loadNotes(true);
    }, 2500);
    return () => clearInterval(id);
  }, [anyBusy, loadNotes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 20);
      } else if (event.key === "Escape" && !menu) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const groups = useMemo(() => {
    const result: Array<{ heading: string; items: NoteListItem[] }> = [];
    const index = new Map<string, NoteListItem[]>();
    for (const note of notes) {
      const heading = formatDateHeading(displayedSort === "createdAt" ? note.createdAt : note.updatedAt);
      let list = index.get(heading);
      if (!list) {
        list = [];
        index.set(heading, list);
        result.push({ heading, items: list });
      }
      list.push(note);
    }
    return result;
  }, [notes, displayedSort]);

  const selecting = selected.size > 0;
  const selectedNotes = notes.filter((note) => selected.has(note.id));

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: "archive" | "unarchive" | "delete" | "tag" | "untag", tagId?: number) {
    const ids = [...selected];
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
      const verb = { archive: "Archived", unarchive: "Restored", delete: "Deleted", tag: "Tagged", untag: "Removed tag from" }[action];
      toast(`${verb} ${ids.length} note${ids.length === 1 ? "" : "s"}`);
      if (action !== "tag" && action !== "untag") setSelected(new Set());
      setMenu(null);
      await Promise.all([loadNotes(true), loadTags()]);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function archiveOne(note: NoteListItem) {
    try {
      await api(`/api/notes/${note.id}`, { method: "PATCH", json: { archived: !note.archived } });
      toast(note.archived ? "Note restored from archive" : "Note archived");
      await Promise.all([loadNotes(true), loadTags()]);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  async function deleteOne(note: NoteListItem) {
    const confirmed = await askConfirm({
      title: "Delete this note?",
      subject: note.title || "Untitled note",
      message: "It will be permanently deleted, along with its audio. This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
      icon: Trash2,
    });
    if (!confirmed) return;
    try {
      await api(`/api/notes/${note.id}`, { method: "DELETE" });
      toast("Note deleted");
      await Promise.all([loadNotes(true), loadTags()]);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  const filterTabs: Array<{ key: string; label: string; active: boolean; onClick: () => void; color?: string }> = [
    { key: "all", label: "All", active: filter.kind === "all", onClick: () => setFilter({ kind: "all" }) },
    { key: "unsorted", label: "Unsorted", active: filter.kind === "unsorted", onClick: () => setFilter({ kind: "unsorted" }) },
    ...tags.map((tag) => ({
      key: `tag-${tag.id}`,
      label: tag.title,
      color: tag.color,
      active: filter.kind === "tag" && filter.tagId === tag.id,
      onClick: () => setFilter({ kind: "tag", tagId: tag.id }),
    })),
    { key: "archive", label: "Archive", active: filter.kind === "archive", onClick: () => setFilter({ kind: "archive" }) },
  ];

  const emptyMessage = displayedQuery
    ? { title: "No matching notes", body: `Nothing matched "${displayedQuery}" in your notes or rewrites.` }
    : displayedFilter.kind === "archive"
      ? { title: "Your archive is empty", body: "Notes you archive stay safely stored here." }
      : displayedFilter.kind === "unsorted"
        ? { title: "All caught up", body: "Notes without tags show up here." }
        : displayedFilter.kind === "tag"
          ? { title: "No notes with this tag", body: "Add this tag inside any note to organize it here." }
          : { title: "Capture your first thought", body: "Record a voice note, upload audio, or start writing." };

  const searchExpanded = searchOpen || Boolean(debounced);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[82rem] flex-col px-5 pb-32 pt-2.5 sm:px-8 xl:px-14">
      <header className="sticky top-2.5 z-20 mb-8 sm:mb-10">
        <div className="mx-auto flex w-full max-w-[44.25rem] items-center justify-center gap-1.5">
          <Popover
            open={menu === "sort"}
            onClose={() => setMenu(null)}
            panelClassName="left-0 top-13 w-52"
            trigger={
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => setMenu(menu === "sort" ? null : "sort")}
                aria-label="Sort by"
                aria-expanded={menu === "sort"}
                className="frosted-topbar flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
              >
                <ArrowUpDown className="h-4 w-4" />
              </motion.button>
            }
          >
            <p className="menu-label">Sort by</p>
            {(
              [
                ["updatedAt", "Last updated"],
                ["createdAt", "Creation date"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="menu-item justify-between"
                onClick={() => {
                  setSortBy(value);
                  setMenu(null);
                }}
              >
                {label}
                {sortBy === value && <Check className="!text-[var(--brand)]" />}
              </button>
            ))}
          </Popover>

          <div className="frosted-topbar flex w-fit max-w-[calc(100%-6.5rem)] items-center rounded-full px-2.5">
            <nav aria-label="Filter notes" className="no-scrollbar flex items-center overflow-x-auto">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={tab.active}
                  onClick={tab.active ? undefined : tab.onClick}
                  className="relative mx-2.5 flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 py-2 text-[0.9375rem]/5 font-semibold text-[var(--ink)] transition-opacity hover:opacity-60"
                >
                  {tab.color && <TagDot color={tab.color} />}
                  <span>{tab.label}</span>
                  {tab.active && (
                    <motion.span
                      layoutId="feed-filter-underline"
                      transition={SPRING_SNAPPY}
                      aria-hidden="true"
                      className="absolute bottom-1 left-0 right-0 h-[0.1875rem] rounded-full bg-[var(--ink)]"
                    />
                  )}
                </button>
              ))}
              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => setTagModalOpen(true)}
                aria-label="Edit tags"
                className="ml-0.5 flex h-9 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-muted)] transition-opacity hover:opacity-60"
              >
                <Pencil className="h-3.5 w-3.5" />
              </motion.button>
            </nav>
          </div>

          <motion.button
            type="button"
            whileTap={TAP_ICON}
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="frosted-topbar flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-65"
          >
            <Settings className="h-5 w-5" />
          </motion.button>
        </div>

        <Accordion open={searchExpanded} className="mx-auto w-full max-w-[44.25rem]">
          <div className="pt-3">
            <div className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search notes, transcripts, and rewrites…"
                aria-label="Search notes"
                className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
              />
              {loading && debounced && <Spinner className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
                aria-label="Close search"
                className="icon-btn h-7 w-7"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Accordion>
      </header>

      <div className="space-y-3">
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
          <Link href="/record" className="alert alert-warning flex items-center gap-2.5 transition-opacity hover:opacity-85">
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

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        aria-busy={loading}
        className="flex flex-1 flex-col"
      >
        <AnimatePresence initial={false}>
          {galleryBanner && displayedFilter.kind === "all" && !displayedQuery && (
            <motion.div
              key="gallery-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="pb-8">
                <article className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[2rem] bg-[var(--banner-sky)] p-6 text-[#01050f] sm:p-8 md:flex-row">
                  <div className="flex flex-1 flex-col items-start justify-center gap-2 self-stretch">
                    <h2 className="text-[1.875rem]/[1.18] font-bold tracking-tight sm:text-[2.125rem]">
                      Rewrite Options Gallery
                    </h2>
                    <p className="max-w-xs text-[0.9375rem]/5 text-[#01050f]/80">
                      Discover, customize, and save your favorite rewrite options.
                    </p>
                    <Link
                      href="/settings/gallery"
                      className="mt-2 inline-flex min-h-12 min-w-[10.25rem] items-center justify-center rounded-xl bg-[#5b3aed] px-6 py-3 text-base/[1.2] font-semibold text-[#fef8fb] transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
                    >
                      Discover
                    </Link>
                  </div>

                  <div aria-hidden="true" className="hidden flex-[1.5] items-center justify-end sm:flex">
                    <div className="rounded-[9999px] bg-white/30 px-7 py-5">
                      <div className="w-[21rem] rounded-2xl bg-[#181429] p-4 text-[#fef8fb] shadow-xl">
                        <p className="text-center text-xs font-semibold text-white/80">Rewrite Options Gallery</p>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] text-white/80">
                          {[
                            [FileText, "Text Editing", "bg-violet-500/25 text-violet-200"],
                            [Mail, "Emails", "bg-emerald-500/25 text-emerald-200"],
                            [BookOpen, "Journaling", "bg-amber-500/25 text-amber-200"],
                            [Briefcase, "Work", "bg-sky-500/25 text-sky-200"],
                          ].map(([IconComp, catLabel, badgeCls]) => {
                            const CatIcon = IconComp as typeof FileText;
                            return (
                              <div key={catLabel as string} className="rounded-xl bg-white/8 p-2">
                                <span className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-lg ${badgeCls as string}`}>
                                  <CatIcon className="h-3.5 w-3.5" />
                                </span>
                                <span className="block truncate">{catLabel as string}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-gradient-to-br from-amber-300/90 to-orange-400/90 p-2.5 text-[#01050f]">
                            <span className="text-[11px] font-bold">Meeting Notes</span>
                            <span className="mt-0.5 block text-[10px] opacity-75">Key decisions &amp; next steps</span>
                          </div>
                          <div className="rounded-xl bg-gradient-to-br from-rose-300/90 to-violet-400/90 p-2.5 text-[#01050f]">
                            <span className="text-[11px] font-bold">Polite Email</span>
                            <span className="mt-0.5 block text-[10px] opacity-75">Clear, warm &amp; ready to send</span>
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
                    className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#01050f]/15 text-[#01050f]/75 transition-opacity hover:opacity-60"
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
        ) : !result ? (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] sm:gap-6" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="surface-card h-[14.5rem] animate-pulse rounded-[1.75rem] opacity-60" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <motion.div
            key={`empty-${result.view.key}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="surface-card mx-auto mt-6 max-w-lg rounded-[2rem] px-6 py-16 text-center"
          >
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
              <Mic className="h-6 w-6" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)]">{emptyMessage.title}</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-[0.9375rem] text-[var(--ink-muted)]">{emptyMessage.body}</p>
            {displayedFilter.kind === "all" && !displayedQuery && (
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <Link href="/record" className="btn btn-primary">
                  <Mic className="h-4 w-4" /> Record voice note
                </Link>
                <Link href="/notes/new" className="btn btn-secondary">
                  <FileText className="h-4 w-4" /> Write a note
                </Link>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.heading} aria-label={group.heading}>
                <h2 className="mb-5 text-[1.75rem]/[1.15] font-bold tracking-tight sm:text-[2rem]">
                  {renderDateHeading(group.heading)}
                </h2>
                <ul className="grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] sm:gap-6">
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
                          selected={selected.has(note.id)}
                          selecting={selecting}
                          onToggleSelect={() => toggle(note.id)}
                          onArchive={() => void archiveOne(note)}
                          onDelete={() => void deleteOne(note)}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        )}
      </motion.main>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <AnimatePresence mode="wait" initial={false}>
          {selecting ? (
            <motion.div
              key="bulk-dock"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="frosted-dock pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full px-2.5 py-1.5 no-scrollbar"
            >
              <span className="whitespace-nowrap px-3 text-sm font-semibold text-[var(--ink)]">{selected.size} selected</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={bulkBusy || selected.size < 2} onClick={() => setMergeOpen(true)}>
                <Merge className="h-4 w-4" /> Merge
              </button>
              <Popover
                open={menu === "bulkTag"}
                onClose={() => setMenu(null)}
                panelClassName="bottom-13 left-0 max-h-72 w-56 overflow-y-auto"
                trigger={
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={bulkBusy || tags.length === 0}
                    onClick={() => setMenu(menu === "bulkTag" ? null : "bulkTag")}
                  >
                    <TagIcon className="h-4 w-4" /> Tag
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
                      {all && <Check className="!text-[var(--brand)]" />}
                    </button>
                  );
                })}
              </Popover>
              {displayedFilter.kind === "archive" ? (
                <button type="button" className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => void bulk("unarchive")}>
                  <ArchiveRestore className="h-4 w-4" /> Restore
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => void bulk("archive")}>
                  <Archive className="h-4 w-4" /> Archive
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm hover:!text-[var(--danger)]" disabled={bulkBusy} onClick={() => void bulk("delete")}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button type="button" className="icon-btn" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="main-dock"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="frosted-dock pointer-events-auto flex items-center gap-2 rounded-full px-2 py-1.5"
            >
              <Popover
                open={menu === "plus"}
                onClose={() => setMenu(null)}
                panelClassName="bottom-15 left-0 w-56"
                trigger={
                  <motion.button
                    type="button"
                    whileTap={TAP_ICON}
                    onClick={() => setMenu(menu === "plus" ? null : "plus")}
                    aria-label="More ways to create a note"
                    aria-expanded={menu === "plus"}
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] transition-opacity hover:opacity-55"
                  >
                    <motion.span
                      animate={{ rotate: menu === "plus" ? 45 : 0 }}
                      transition={SPRING_SNAPPY}
                      className="inline-flex"
                    >
                      <Plus className="h-5 w-5" />
                    </motion.span>
                  </motion.button>
                }
              >
                <Link href="/notes/new" className="menu-item" onNavigate={() => setMenu(null)}>
                  <FileText /> Write a note
                </Link>
                <Link href="/record/upload" className="menu-item" onNavigate={() => setMenu(null)}>
                  <Upload /> Upload audio or video
                </Link>
                <Link href="/record?mode=meeting" className="menu-item" onNavigate={() => setMenu(null)}>
                  <MonitorSpeaker /> Record a meeting
                </Link>
              </Popover>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={TAP_PRESS} transition={SPRING_SNAPPY}>
                <Link
                  href="/record"
                  aria-label="Record a voice note"
                  className="flex h-[3.375rem] w-[7.5rem] items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-opacity duration-150 hover:opacity-80"
                >
                  <CuteMicIcon className="h-10 w-10" />
                </Link>
              </motion.div>

              <motion.button
                type="button"
                whileTap={TAP_ICON}
                onClick={() => {
                  setSearchOpen((open) => !open || Boolean(debounced));
                  setTimeout(() => searchRef.current?.focus(), 20);
                }}
                aria-label="Search notes"
                className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ${
                  searchExpanded ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--ink)] hover:opacity-55"
                }`}
              >
                <Search className="h-5 w-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenTags={() => {
          setSettingsOpen(false);
          setTagModalOpen(true);
        }}
      />
      <TagModal
        open={tagModalOpen}
        tags={tags}
        onClose={() => setTagModalOpen(false)}
        onChanged={() => {
          void loadTags();
          void loadNotes(true);
        }}
      />
      <MergeDialog open={mergeOpen} notes={selectedNotes} onClose={() => setMergeOpen(false)} />
    </div>
  );
}
