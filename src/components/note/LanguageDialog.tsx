"use client";

import { useEffect, useMemo, useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { CheckCircleFilledIcon, SearchLoopIcon } from "../icons";
import { Dialog } from "../ui";

interface LanguageDialogProps {
  open: boolean;
  title: string;
  description?: string;
  includeAuto?: boolean;
  current?: string | null;
  onClose: () => void;
  onPick: (code: string) => void;
}

/** Searchable language list (by English or native name) in Letterly blush modal style. */
export function LanguageDialog({ open, title, description, includeAuto, current, onClose, onPick }: LanguageDialogProps) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const options = useMemo(() => {
    const all = [...(includeAuto ? [{ code: "auto", name: "Auto-detect", native: "Detect automatically" }] : []), ...LANGUAGES];
    const q = query.trim().toLowerCase();
    return q ? all.filter((item) => item.name.toLowerCase().includes(q) || item.native.toLowerCase().includes(q) || item.code === q) : all;
  }, [includeAuto, query]);

  return (
    <Dialog open={open} onClose={onClose} title={title} centeredHeader size="md">
      {description && <p className="mb-3 text-center text-xs text-[var(--ink-muted)]">{description}</p>}
      <div className="relative">
        <SearchLoopIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search languages"
          className="field h-11 rounded-full bg-[var(--surface-input)] pl-11"
        />
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl bg-[var(--surface-panel-card)] divide-y divide-[var(--border)]/70">
        {options.map((item) => {
          const active = (current ?? "auto") === item.code;
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => onPick(item.code)}
              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]/45"
            >
              <div className="min-w-0">
                <span className="block truncate text-[0.9375rem] font-medium text-[var(--ink)]">{item.name}</span>
                <span className="block truncate text-xs text-[var(--ink-muted)]">{item.native}</span>
              </div>
              {active && <CheckCircleFilledIcon className="h-5 w-5 shrink-0 text-[var(--ink)]" />}
            </button>
          );
        })}
        {options.length === 0 && <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No language matches “{query}”.</p>}
      </div>
    </Dialog>
  );
}
