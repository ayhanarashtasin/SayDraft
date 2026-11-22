"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
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

/** Searchable language list (by English or native name). */
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
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search languages" aria-label="Search languages" className="field pl-9" />
      </div>
      <ul className="mt-3 max-h-80 space-y-0.5 overflow-y-auto">
        {options.map((item) => (
          <li key={item.code}>
            <button type="button" className="menu-item" onClick={() => onPick(item.code)}>
              <span className="flex-1">
                {item.name}
                <span className="ml-2 text-xs text-[var(--ink-muted)]">{item.native}</span>
              </span>
              {(current ?? "auto") === item.code && <Check className="!text-[var(--brand)]" />}
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="py-6 text-center text-sm text-[var(--ink-muted)]">No language matches “{query}”.</li>}
      </ul>
    </Dialog>
  );
}
