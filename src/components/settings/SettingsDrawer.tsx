"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, FolderArchive, LayoutGrid, Plug, SlidersHorizontal, Sparkles, UserRound, Zap } from "lucide-react";
import { motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { languageLabel } from "@/lib/languages";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { AppSettings } from "@/lib/types";
import { LogoutButton } from "../auth/LogoutButton";
import { useCurrentUser } from "../auth/useCurrentUser";
import { LanguageDialog } from "../note/LanguageDialog";
import { useAppStatus } from "../StatusProvider";
import { type Theme, useTheme } from "../ThemeProvider";
import { useToast } from "../Toast";
import { Drawer } from "../ui";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenTags: () => void;
}

function RowChevron() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink-muted)]/20 text-[var(--ink-subtle)]">
      <ChevronRight className="h-3.5 w-3.5" />
    </span>
  );
}

export function SettingsDrawer({ open, onClose, onOpenTags }: SettingsDrawerProps) {
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const { status, refresh } = useAppStatus();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [langOpen, setLangOpen] = useState(false);
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
    setLangOpen(false);
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

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Settings">
        <div className="flex flex-col gap-6 px-6 pb-8 pt-6">
          <Link
            href="/settings/whats-new"
            onClick={onClose}
            className="flex items-center justify-between gap-3 rounded-3xl bg-[var(--banner-sky-soft)] p-4 text-[#01050f] transition-opacity hover:opacity-80"
          >
            <Zap className="h-5 w-5 shrink-0 fill-current" />
            <span className="flex-1 text-[1.0625rem]/6 font-medium tracking-tight">What&apos;s new</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#01050f] text-[#fef8fb]">
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>

          <section>
            <header className="text-[1.0625rem]/5 font-semibold text-[var(--ink-subtle)]">Account</header>
            <div className="mt-2 flex flex-col divide-y divide-[var(--border-subtle)] rounded-3xl bg-[var(--surface-panel-card)] px-4">
              <Link
                href="/settings/account"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <UserRound className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{user ? user.name || user.email : "Your account"}</span>
                  {user?.name && <span className="block truncate text-[0.8125rem]/4 text-[var(--ink-muted)]">{user.email}</span>}
                </div>
                <RowChevron />
              </Link>
              <LogoutButton variant="row" />
            </div>
          </section>

          <section>
            <header className="text-[1.0625rem]/5 font-semibold text-[var(--ink-subtle)]">Rewrite options</header>
            <div className="mt-2 flex flex-col divide-y divide-[var(--border-subtle)] rounded-3xl bg-[var(--surface-panel-card)] px-4">
              <Link
                href="/settings/gallery"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3.5 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <LayoutGrid className="h-5 w-5 shrink-0 text-[var(--ink)]" />
                <span className="flex-1 truncate font-medium">Rewrite Options Gallery</span>
                <RowChevron />
              </Link>
              <Link
                href="/settings/prompts"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3.5 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <Sparkles className="h-5 w-5 shrink-0 text-[var(--ink)]" />
                <span className="flex-1 truncate font-medium">My rewrite styles</span>
                <RowChevron />
              </Link>
            </div>
          </section>

          <section>
            <header className="text-[1.0625rem]/5 font-semibold text-[var(--ink-subtle)]">Preferences</header>
            <ul className="mt-2 flex flex-col divide-y divide-[var(--border-subtle)] rounded-3xl bg-[var(--surface-panel-card)] px-4">
              <li>
                <div role="radiogroup" aria-label="Appearance" className="flex gap-1 py-2.5">
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
                        className={`relative flex-1 cursor-pointer rounded-full py-1.5 text-[0.9375rem] transition-colors duration-150 ${
                          active ? "font-semibold text-[var(--ink)]" : "font-medium text-[var(--ink-subtle)] hover:opacity-75"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="drawer-theme-pill"
                            transition={SPRING_SNAPPY}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full bg-[var(--surface-panel)] shadow-xs"
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
                  onClick={() => setLangOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-2 py-3 text-left text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <span className="flex-1 truncate">Speaker&apos;s language</span>
                  <span className="truncate text-[0.9375rem] text-[var(--ink-subtle)]">
                    {currentLanguage === "auto" ? "Auto" : languageLabel(currentLanguage)}
                  </span>
                  <RowChevron />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenTags}
                  className="flex w-full cursor-pointer items-center gap-2 py-3 text-left text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <span className="flex-1 truncate">Tags</span>
                  <RowChevron />
                </button>
              </li>
              <li>
                <Link
                  href="/settings/dictionary"
                  onClick={onClose}
                  className="flex w-full items-center gap-2 py-3 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">Dictionary</span>
                    <span className="block truncate text-[0.8125rem]/4 text-[var(--ink-muted)]">Get names and words spelled right</span>
                  </div>
                  <RowChevron />
                </Link>
              </li>
              <li>
                <Link
                  href="/settings/replacements"
                  onClick={onClose}
                  className="flex w-full items-center gap-2 py-3 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">Text replacements</span>
                    <span className="block truncate text-[0.8125rem]/4 text-[var(--ink-muted)]">Turn phrases into custom text</span>
                  </div>
                  <RowChevron />
                </Link>
              </li>
              <li>
                <Link
                  href="/settings/preferences"
                  onClick={onClose}
                  className="flex w-full items-center gap-2 py-3 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-[var(--ink-subtle)]" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">More preferences</span>
                    <span className="block truncate text-[0.8125rem]/4 text-[var(--ink-muted)]">Auto-titles, auto-rewrite &amp; advanced</span>
                  </div>
                  <RowChevron />
                </Link>
              </li>
            </ul>
          </section>

          <section>
            <header className="text-[1.0625rem]/5 font-semibold text-[var(--ink-subtle)]">Integrations</header>
            <div className="mt-2 flex flex-col divide-y divide-[var(--border-subtle)] rounded-3xl bg-[var(--surface-panel-card)] px-4">
              <Link
                href="/settings/actions"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <Plug className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate">Connect apps &amp; webhooks</span>
                  <span className="block truncate text-[0.8125rem]/4 text-[var(--ink-muted)]">Zapier, Make, n8n &amp; Notion</span>
                </div>
                <RowChevron />
              </Link>
            </div>
          </section>

          <section>
            <header className="text-[1.0625rem]/5 font-semibold text-[var(--ink-subtle)]">Your data</header>
            <div className="mt-2 flex flex-col divide-y divide-[var(--border-subtle)] rounded-3xl bg-[var(--surface-panel-card)] px-4">
              <Link
                href="/settings/data"
                onClick={onClose}
                className="flex w-full items-center gap-3 py-3 text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70"
              >
                <FolderArchive className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate">Library &amp; backup</span>
                  <span className="block truncate text-[0.8125rem]/4 text-[var(--ink-muted)]">Stats &amp; full ZIP export</span>
                </div>
                <RowChevron />
              </Link>
            </div>
          </section>
        </div>
      </Drawer>

      <LanguageDialog
        open={langOpen}
        title="Speaker's language"
        description="Choose the language you usually speak so transcripts stay accurate."
        includeAuto
        current={currentLanguage}
        onClose={() => setLangOpen(false)}
        onPick={(code) => void saveLanguage(code)}
      />
    </>
  );
}
