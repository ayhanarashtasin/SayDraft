"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderArchive, RefreshCw, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { languageLabel } from "@/lib/languages";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { AppSettings } from "@/lib/types";
import { LogoutButton } from "../auth/LogoutButton";
import { useCurrentUser } from "../auth/useCurrentUser";
import { BoltFilledIcon, BriefcaseGalleryIcon, ChevronCircleRightIcon } from "../icons";
import { LanguageDialog } from "../note/LanguageDialog";
import { useAppStatus } from "../StatusProvider";
import { type Theme, useTheme } from "../ThemeProvider";
import { useToast } from "../Toast";
import { CuteMicIcon, Dialog, Drawer } from "../ui";
import { IntegrationsSection } from "./IntegrationsSection";
import { DictionarySection, ReplacementsSection } from "./VocabularySections";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenTags: () => void;
  onOpenGallery: () => void;
}

type ModalKind = "language" | "dictionary" | "replacements" | "actions" | null;

export function SettingsDrawer({ open, onClose, onOpenTags, onOpenGallery }: SettingsDrawerProps) {
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const { status, refresh } = useAppStatus();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const user = useCurrentUser(open);

  useEffect(() => {
    if (!open) return;
    if (status?.settings && !settings) setSettings(status.settings);
    api<{ settings: AppSettings }>("/api/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => undefined);
  }, [open, status?.settings]);

  const currentLanguage = settings?.defaultLanguage ?? status?.settings.defaultLanguage ?? "auto";

  async function saveLanguage(code: string) {
    setModal(null);
    try {
      const data = await api<{ settings: AppSettings }>("/api/settings", {
        method: "PATCH",
        json: { defaultLanguage: code },
      });
      setSettings(data.settings);
      toast("Speaker's language saved");
      void refresh();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  function clearUiCache() {
    try {
      for (const key of ["saydraft-sort", "saydraft-filter", "saydraft-gallery-banner-dismissed", "saydraft-new-note-draft", "saydraft-mic"]) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
      toast("Local UI cache cleared");
    } catch {
      toast("Cache cleared");
    }
  }

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Settings">
        <div className="flex flex-col gap-5 px-5 pb-8 pt-5">
          <Link
            href="/settings/whats-new"
            onClick={onClose}
            className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--sky)] px-4 py-3.5 text-[#01050f] transition-opacity hover:opacity-85"
          >
            <BoltFilledIcon className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-[0.9375rem]/6 font-semibold tracking-tight">What&apos;s new</span>
            <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[#01050f]" arrowStroke="var(--sky)" />
          </Link>

          <section>
            <header className="mb-2 px-1 text-[0.875rem] font-semibold text-[var(--ink-subtle)]">Rewrite options</header>
            <div className="flex flex-col rounded-2xl bg-[var(--surface-panel-card)] px-4">
              <button
                type="button"
                onClick={onOpenGallery}
                className="flex w-full cursor-pointer items-center gap-3 py-3.5 text-left text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <BriefcaseGalleryIcon className="h-5 w-5 shrink-0 text-[var(--ink)]" />
                <span className="flex-1 truncate">Rewrite Options Gallery</span>
                <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
              </button>
              <Link
                href="/settings/prompts"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3.5 text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-[var(--ink)]" />
                <span className="flex-1 truncate">My rewrite styles</span>
                <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
              </Link>
            </div>
          </section>

          <section>
            <header className="mb-2 px-1 text-[0.875rem] font-semibold text-[var(--ink-subtle)]">Preferences</header>
            <ul className="flex flex-col rounded-2xl bg-[var(--surface-panel-card)] px-4">
              <li>
                <div role="radiogroup" aria-label="Appearance" className="flex gap-1 py-2">
                  {(
                    [
                      ["system", "System"],
                      ["light", "Light"],
                      ["dark", "Dark"],
                    ] as Array<[Theme, string]>
                  ).map(([value, label]) => {
                    const active = theme === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setTheme(value)}
                        className={`relative flex-1 cursor-pointer rounded-xl py-1.5 text-[0.875rem] ${
                          active ? "font-semibold text-[var(--ink)]" : "font-medium text-[var(--ink-subtle)] hover:opacity-75"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="drawer-theme-pill"
                            transition={SPRING_SNAPPY}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xl bg-[var(--surface-panel)] shadow-xs"
                          />
                        )}
                        <span className="relative z-10">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setModal("language")}
                  className="flex w-full cursor-pointer items-center gap-2 py-3 text-left text-[0.9375rem] text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <span className="flex-1 truncate font-medium">Speaker&apos;s language</span>
                  <span className="truncate text-sm text-[var(--ink-subtle)]">
                    {currentLanguage === "auto" ? "Auto" : languageLabel(currentLanguage)}
                  </span>
                  <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenTags}
                  className="flex w-full cursor-pointer items-center gap-2 py-3 text-left text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <span className="flex-1 truncate">Tags</span>
                  <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setModal("dictionary")}
                  className="flex w-full cursor-pointer items-center gap-2 py-3 text-left text-[0.9375rem] text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">Dictionary</span>
                    <span className="block truncate text-xs text-[var(--ink-muted)]">Get names and words spelled right</span>
                  </div>
                  <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setModal("replacements")}
                  className="flex w-full cursor-pointer items-center gap-2 py-3 text-left text-[0.9375rem] text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">Text replacements</span>
                    <span className="block truncate text-xs text-[var(--ink-muted)]">Turn phrases into custom text</span>
                  </div>
                  <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
                </button>
              </li>
              <li>
                <Link
                  href="/settings/preferences"
                  onClick={onClose}
                  className="flex w-full items-center gap-2 py-3 text-[0.9375rem] text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-[var(--ink-subtle)]" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">More preferences</span>
                    <span className="block truncate text-xs text-[var(--ink-muted)]">Auto-titles, auto-rewrite &amp; models</span>
                  </div>
                  <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
                </Link>
              </li>
            </ul>
          </section>

          <section>
            <header className="mb-2 px-1 text-[0.875rem] font-semibold text-[var(--ink-subtle)]">Integrations</header>
            <div className="rounded-2xl bg-[var(--surface-panel-card)] px-4">
              <button
                type="button"
                onClick={() => setModal("actions")}
                className="flex w-full cursor-pointer items-center gap-3 py-3.5 text-left text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <span className="flex-1 truncate">Actions</span>
                <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-[var(--surface-panel-card)] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-panel)] text-[var(--ink)]">
                <CuteMicIcon className="h-8 w-8" eyeFill="var(--surface-panel)" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--ink-muted)]">Workspace</p>
                <p className="truncate text-base font-bold text-[var(--ink)]">Saydraft</p>
                {user && <p className="truncate text-xs text-[var(--ink-subtle)]">{user.name || user.email}</p>}
              </div>
            </div>
          </section>

          <section>
            <div className="flex flex-col rounded-2xl bg-[var(--surface-panel-card)] px-4">
              <Link
                href="/settings/data"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3 text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <FolderArchive className="h-4 w-4 shrink-0 text-[var(--ink-subtle)]" />
                <span className="flex-1 truncate">Export data</span>
                <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
              </Link>
              <button
                type="button"
                onClick={clearUiCache}
                className="flex w-full cursor-pointer items-center gap-3 py-3 text-left text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <RefreshCw className="h-4 w-4 shrink-0 text-[var(--ink-subtle)]" />
                <span className="flex-1 truncate">Clear cache</span>
              </button>
              <Link
                href="/settings/account"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3 text-[0.9375rem] font-medium text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <UserRound className="h-4 w-4 shrink-0 text-[var(--ink-subtle)]" />
                <span className="flex-1 truncate">Account</span>
                <ChevronCircleRightIcon className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]/45" />
              </Link>
              <LogoutButton variant="row" />
            </div>
          </section>
        </div>
      </Drawer>

      <LanguageDialog
        open={modal === "language"}
        title="Speaker's language"
        description="Choose the language you usually speak so transcripts stay accurate."
        includeAuto
        current={currentLanguage}
        onClose={() => setModal(null)}
        onPick={(code) => void saveLanguage(code)}
      />

      <Dialog open={modal === "dictionary"} onClose={() => setModal(null)} title="Dictionary" centeredHeader size="md">
        <DictionarySection embedded />
      </Dialog>

      <Dialog open={modal === "replacements"} onClose={() => setModal(null)} title="Text replacements" centeredHeader size="md">
        <ReplacementsSection embedded />
      </Dialog>

      <Dialog open={modal === "actions"} onClose={() => setModal(null)} title="Actions" centeredHeader size="lg">
        <IntegrationsSection embedded />
      </Dialog>
    </>
  );
}
