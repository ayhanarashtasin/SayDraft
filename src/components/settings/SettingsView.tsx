"use client";

import Link from "next/link";
import { ArrowLeft, BookA, FolderArchive, LayoutGrid, Megaphone, Plug, Replace, SlidersHorizontal, Sparkles, Tags, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion";
import { AccountSection } from "./AccountSection";
import { GallerySection } from "./GallerySection";
import { DataSection, PlanSection, WhatsNewSection } from "./InfoSections";
import { IntegrationsSection } from "./IntegrationsSection";
import { PreferencesSection } from "./PreferencesSection";
import { PromptEditor } from "./PromptEditor";
import { PromptsSection } from "./PromptsSection";
import { DictionarySection, ReplacementsSection, TagsSection } from "./VocabularySections";

const NAV = [
  { slug: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { slug: "prompts", label: "Rewrite styles", icon: Sparkles },
  { slug: "gallery", label: "Gallery", icon: LayoutGrid },
  { slug: "dictionary", label: "Dictionary", icon: BookA },
  { slug: "replacements", label: "Text replacements", icon: Replace },
  { slug: "tags", label: "Tags", icon: Tags },
  { slug: "actions", label: "Integrations", icon: Plug },
  { slug: "data", label: "Library & backup", icon: FolderArchive },
  { slug: "account", label: "Account", icon: UserRound },
  { slug: "whats-new", label: "What's new", icon: Megaphone },
] as const;

function Section({ slug, extra }: { slug: string; extra?: string }) {
  switch (slug) {
    case "prompts":
      return <PromptsSection />;
    case "edit-prompt":
      return <PromptEditor key={extra ?? "new"} id={extra ?? "new"} />;
    case "gallery":
      return <GallerySection />;
    case "dictionary":
      return <DictionarySection />;
    case "replacements":
      return <ReplacementsSection />;
    case "tags":
      return <TagsSection />;
    case "actions":
      return <IntegrationsSection />;
    case "subscription":
      return <PlanSection />;
    case "data":
      return <DataSection />;
    case "account":
      return <AccountSection />;
    case "whats-new":
      return <WhatsNewSection />;
    default:
      return <PreferencesSection />;
  }
}

export function SettingsView({ slug }: { slug: string[] }) {
  const [section = "preferences", extra] = slug;
  const known = section === "edit-prompt" || section === "subscription" || NAV.some((item) => item.slug === section);
  const current = known ? section : "preferences";
  const highlighted = current === "edit-prompt" ? "prompts" : current;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-5 md:flex-row md:px-8">
      <aside className="md:sticky md:top-5 md:h-fit md:w-56 md:shrink-0">
        <Link
          href="/"
          className="frosted-topbar inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[var(--ink)] transition-opacity hover:opacity-65"
        >
          <ArrowLeft className="h-4 w-4" /> Notes
        </Link>
        <h2 className="mt-6 hidden px-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] md:block">Settings</h2>
        <nav aria-label="Settings sections" className="no-scrollbar mt-4 flex gap-1 overflow-x-auto pb-1 md:mt-2 md:flex-col md:overflow-visible">
          {NAV.map(({ slug: itemSlug, label, icon: Icon }) => {
            const active = highlighted === itemSlug;
            return (
              <Link
                key={itemSlug}
                href={`/settings/${itemSlug}`}
                aria-current={active ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ${
                  active ? "text-[var(--ink)]" : "text-[var(--ink-subtle)] hover:bg-[var(--surface)]/65 hover:text-[var(--ink)]"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="settings-nav-pill"
                    transition={SPRING_SNAPPY}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl bg-[var(--surface)] shadow-xs ring-1 ring-[var(--border)]"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 pb-20">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slug.join("/")}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
          >
            <Section slug={current} extra={extra} />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
