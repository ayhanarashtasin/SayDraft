"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { TAP_ICON } from "@/lib/motion";
import { motion } from "motion/react";
import { SearchLoopIcon } from "../icons";
import { Spinner } from "../ui";

/** Right sidebar language picker matching Letterly's "Translate to" panel. */
export function TranslatePanel({
  busy = false,
  disabled = false,
  disabledReason,
  onSelect,
  onClose,
}: {
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (lang) => lang.name.toLowerCase().includes(q) || lang.native.toLowerCase().includes(q) || lang.code.toLowerCase() === q,
    );
  }, [query]);

  return (
    <aside aria-label="Translate to" className="flex h-full w-full flex-col bg-[var(--surface-panel)]">
      <div className="relative flex min-h-[3.875rem] items-center justify-center border-b border-[var(--border)] px-14">
        <h2 className="text-[1rem] font-semibold text-[var(--ink)]">Translate to</h2>
        <motion.button
          type="button"
          whileTap={TAP_ICON}
          onClick={onClose}
          aria-label="Close translate panel"
          className="circle-close absolute right-4 top-1/2 -translate-y-1/2"
        >
          <X className="h-4 w-4" />
        </motion.button>
      </div>

      <div className="px-4 pt-3.5">
        <div className="relative">
          <SearchLoopIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search languages"
            className="field h-11 rounded-full border-2 border-transparent bg-[var(--surface-input)] pl-11 focus:border-[var(--brand)] focus:shadow-none"
          />
        </div>
      </div>

      {disabled && disabledReason && (
        <p className="mx-4 mt-3 rounded-xl bg-[var(--surface-panel-card)] px-3.5 py-2 text-xs text-[var(--ink-subtle)]">
          {disabledReason}
        </p>
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        <p className="mb-2 px-1 text-xs font-semibold text-[var(--ink-muted)]">All languages</p>
        <div className="overflow-hidden rounded-2xl bg-[var(--surface-panel-card)] divide-y divide-[var(--border)]/70">
          {filtered.map((lang) => (
            <button
              key={lang.code}
              type="button"
              disabled={disabled || busy}
              onClick={() => onSelect(lang.code)}
              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]/45 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div className="min-w-0">
                <span className="block truncate text-[0.9375rem] font-medium text-[var(--ink)]">{lang.name}</span>
                <span className="block truncate text-xs text-[var(--ink-muted)]">{lang.native}</span>
              </div>
              {busy && <Spinner className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">No language matches “{query}”.</p>}
        </div>
      </div>
    </aside>
  );
}
