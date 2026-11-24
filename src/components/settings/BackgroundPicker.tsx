"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import {
  BACKGROUND_CHANGE_EVENT,
  BACKGROUND_STORAGE_KEY,
  type BackgroundPreference,
  DASHBOARD_BACKGROUNDS,
  readBackgroundPreference,
  writeBackgroundPreference,
} from "@/lib/dashboard-backgrounds";

export function useBackgroundPreference(): [BackgroundPreference, (next: BackgroundPreference) => void] {
  const [pref, setPref] = useState<BackgroundPreference>("auto");

  useEffect(() => {
    const sync = () => setPref(readBackgroundPreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BACKGROUND_STORAGE_KEY) sync();
    };
    sync();
    window.addEventListener(BACKGROUND_CHANGE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((next: BackgroundPreference) => {
    setPref(next);
    writeBackgroundPreference(next);
  }, []);

  return [pref, update];
}

export function BackgroundPicker({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useBackgroundPreference();

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Dashboard background">
      <button
        type="button"
        role="radio"
        aria-checked={pref === "auto"}
        onClick={() => setPref("auto")}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150 ${
          pref === "auto"
            ? "border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]"
            : "border-[var(--border)] bg-[var(--surface-panel-card)]/60 hover:border-[var(--border-strong)]"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-panel)] text-[var(--brand)]">
          <RefreshCw className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--ink)]">Auto-rotate</span>
          <span className="block text-xs text-[var(--ink-muted)]">Cycles all 7 backgrounds every 30 minutes</span>
        </div>
        {pref === "auto" && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </button>

      <div className={`grid gap-2.5 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
        {DASHBOARD_BACKGROUNDS.map((bg) => {
          const active = pref === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPref(bg.id)}
              className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border text-left transition-all duration-150 ${
                active
                  ? "border-[var(--brand)] ring-2 ring-[var(--brand)]"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--surface-subtle)]">
                <img
                  src={bg.src}
                  alt={bg.label}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  style={{ objectPosition: bg.position }}
                />
                {active && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-sm">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </div>
              <span className="truncate bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)]">
                {bg.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
