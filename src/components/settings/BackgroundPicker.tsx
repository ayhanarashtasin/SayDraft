"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import {
  BACKGROUND_CHANGE_EVENT,
  BACKGROUND_STORAGE_KEY,
  type BackgroundPreference,
  DASHBOARD_BACKGROUNDS,
  DEFAULT_BACKGROUND_PREFERENCE,
  getBackgroundIndex,
  readBackgroundPreference,
  writeBackgroundPreference,
} from "@/lib/dashboard-backgrounds";
import { Switch } from "../ui";

export function useBackgroundPreference(): [BackgroundPreference, (next: BackgroundPreference) => void] {
  const [pref, setPref] = useState<BackgroundPreference>(DEFAULT_BACKGROUND_PREFERENCE);

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
  const autoEnabled = pref === "auto";

  function handleAutoToggle(enabled: boolean) {
    if (enabled) {
      setPref("auto");
    } else if (pref === "auto") {
      // Stop auto-rotation on whichever image is currently shown rather than discarding the wallpaper.
      const current = DASHBOARD_BACKGROUNDS[getBackgroundIndex()];
      setPref(current.id);
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-panel-card)]/60 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-panel)] text-[var(--brand)]">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--ink)]">Auto-change every 30 mins</span>
            <span className="block text-xs text-[var(--ink-muted)]">
              {autoEnabled ? "On · Cycling all 7 images every 30 min" : "Off · Pick Default or a fixed image below"}
            </span>
          </div>
        </div>
        <Switch checked={autoEnabled} onChange={handleAutoToggle} label="Auto-change background every 30 minutes" hideLabel />
      </div>

      <div
        role="radiogroup"
        aria-label="Dashboard background"
        className={`grid gap-2.5 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={pref === "none"}
          onClick={() => setPref("none")}
          className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border text-left transition-all duration-150 ${
            pref === "none"
              ? "border-[var(--brand)] ring-2 ring-[var(--brand)]"
              : "border-[var(--border)] hover:border-[var(--border-strong)]"
          }`}
        >
          <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-[var(--canvas)]">
            <div className="h-7 w-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xs" />
            {pref === "none" && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-sm">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </div>
          <span className="truncate bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)]">
            Default (No image)
          </span>
        </button>

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
