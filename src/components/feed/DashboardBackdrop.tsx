"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BACKGROUND_CHANGE_EVENT,
  BACKGROUND_STORAGE_KEY,
  DASHBOARD_BACKGROUNDS,
  msUntilNextRotation,
  readBackgroundPreference,
  resolveBackgroundIndex,
} from "@/lib/dashboard-backgrounds";
import { EASE_OUT } from "@/lib/motion";

const PRELOAD_LEAD_MS = 15_000;

export function DashboardBackdrop() {
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    let rotateTimer: ReturnType<typeof setTimeout> | undefined;
    let preloadTimer: ReturnType<typeof setTimeout> | undefined;

    const preloadNext = (currentIndex: number) => {
      const next = DASHBOARD_BACKGROUNDS[(currentIndex + 1) % DASHBOARD_BACKGROUNDS.length];
      const img = new window.Image();
      img.decoding = "async";
      img.src = next.src;
    };

    const schedule = () => {
      clearTimeout(rotateTimer);
      clearTimeout(preloadTimer);

      const pref = readBackgroundPreference();
      const now = Date.now();
      const current = resolveBackgroundIndex(pref, now);
      setIndex(current);

      if (pref !== "auto") return;

      const delay = msUntilNextRotation(now);
      if (delay <= PRELOAD_LEAD_MS) {
        preloadNext(current);
      } else {
        preloadTimer = setTimeout(() => preloadNext(current), delay - PRELOAD_LEAD_MS);
      }
      rotateTimer = setTimeout(schedule, delay);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BACKGROUND_STORAGE_KEY) schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(BACKGROUND_CHANGE_EVENT, schedule);
    window.addEventListener("storage", onStorage);

    return () => {
      clearTimeout(rotateTimer);
      clearTimeout(preloadTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, schedule);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const current = index === null ? null : DASHBOARD_BACKGROUNDS[index];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      <AnimatePresence initial={true}>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
            className="absolute inset-0"
          >
            <img
              src={current.src}
              alt=""
              decoding="async"
              className="h-full w-full object-cover"
              style={{ objectPosition: current.position }}
            />
            <div className={`dashboard-scrim dashboard-scrim-${current.tone} absolute inset-0`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
