export type BackdropTone = "light" | "horizon" | "halo" | "dark";

export interface DashboardBackground {
  readonly id: string;
  readonly label: string;
  readonly src: string;
  readonly tone: BackdropTone;
  /** CSS object-position focal point so wave horizons stay well-framed on mobile and desktop. */
  readonly position: string;
}

export const ROTATION_INTERVAL_MS = 30 * 60 * 1000;
export const ROTATION_BOUNDARY_BUFFER_MS = 50;
export const BACKGROUND_STORAGE_KEY = "saydraft-dashboard-bg";
export const BACKGROUND_CHANGE_EVENT = "saydraft-dashboard-bg-change";

export const DASHBOARD_BACKGROUNDS: readonly DashboardBackground[] = [
  { id: "turquoise-wave", label: "Turquoise Wave", src: "/dashboard-bg/01-turquoise-wave.webp", tone: "horizon", position: "center bottom" },
  { id: "cyan-splash", label: "Cyan Splash", src: "/dashboard-bg/02-cyan-splash.webp", tone: "dark", position: "center center" },
  { id: "neon-silk", label: "Neon Silk", src: "/dashboard-bg/03-neon-silk.webp", tone: "dark", position: "center bottom" },
  { id: "electric-ribbons", label: "Electric Ribbons", src: "/dashboard-bg/04-electric-ribbons.webp", tone: "dark", position: "center center" },
  { id: "icy-halo", label: "Icy Halo", src: "/dashboard-bg/05-icy-halo.webp", tone: "halo", position: "center top" },
  { id: "icy-marbled", label: "Icy Marbled", src: "/dashboard-bg/06-icy-marbled.webp", tone: "light", position: "center center" },
  { id: "icy-satin", label: "Icy Satin", src: "/dashboard-bg/07-icy-satin.webp", tone: "light", position: "center center" },
] as const;

export type BackgroundPreference = "auto" | (typeof DASHBOARD_BACKGROUNDS)[number]["id"];

export function parseBackgroundPreference(raw: string | null | undefined): BackgroundPreference {
  if (!raw || raw === "auto") return "auto";
  return DASHBOARD_BACKGROUNDS.some((bg) => bg.id === raw) ? raw : "auto";
}

export function getBackgroundIndex(nowMs = Date.now()): number {
  const slot = Math.floor(nowMs / ROTATION_INTERVAL_MS);
  const count = DASHBOARD_BACKGROUNDS.length;
  return ((slot % count) + count) % count;
}

export function resolveBackgroundIndex(pref: BackgroundPreference, nowMs = Date.now()): number {
  if (pref !== "auto") {
    const fixed = DASHBOARD_BACKGROUNDS.findIndex((bg) => bg.id === pref);
    if (fixed >= 0) return fixed;
  }
  return getBackgroundIndex(nowMs);
}

export function backgroundPreferenceLabel(pref: BackgroundPreference): string {
  if (pref === "auto") return "Auto (30m)";
  return DASHBOARD_BACKGROUNDS.find((bg) => bg.id === pref)?.label ?? "Auto (30m)";
}

export function readBackgroundPreference(): BackgroundPreference {
  if (typeof window === "undefined") return "auto";
  try {
    return parseBackgroundPreference(localStorage.getItem(BACKGROUND_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function writeBackgroundPreference(pref: BackgroundPreference): void {
  if (typeof window === "undefined") return;
  const safe = parseBackgroundPreference(pref);
  try {
    localStorage.setItem(BACKGROUND_STORAGE_KEY, safe);
  } catch {
    // Storage can be blocked; still notify listeners for this visit.
  }
  window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT));
}

export function msUntilNextRotation(nowMs = Date.now()): number {
  const remainder = ((nowMs % ROTATION_INTERVAL_MS) + ROTATION_INTERVAL_MS) % ROTATION_INTERVAL_MS;
  return ROTATION_INTERVAL_MS - remainder + ROTATION_BOUNDARY_BUFFER_MS;
}
