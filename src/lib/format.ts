export function formatDateHeading(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - day) / 86_400_000);
  const label = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  if (diffDays === 0) return `Today, ${label}`;
  if (diffDays === 1) return `Yesterday, ${label}`;
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export interface DateGroupHeading {
  key: string;
  primary: string;
  secondary?: string;
  isToday: boolean;
}

/** Feed date buckets matching Letterly: Today, Month D | Yesterday | Previous 7 days | Previous 30 days | Month. */
export function formatDateGroup(timestamp: number, now = new Date()): DateGroupHeading {
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - day) / 86_400_000);
  const monthDay = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  if (diffDays === 0) return { key: "today", primary: "Today,", secondary: monthDay, isToday: true };
  if (diffDays === 1) return { key: "yesterday", primary: "Yesterday", secondary: monthDay, isToday: false };
  if (diffDays >= 2 && diffDays <= 7) return { key: "prev7", primary: "Previous 7 days", isToday: false };
  if (diffDays >= 8 && diffDays <= 30) return { key: "prev30", primary: "Previous 30 days", isToday: false };
  if (date.getFullYear() === now.getFullYear()) {
    return {
      key: `ym-${date.getFullYear()}-${date.getMonth()}`,
      primary: date.toLocaleDateString(undefined, { month: "long" }),
      isToday: false,
    };
  }
  return {
    key: `ym-${date.getFullYear()}-${date.getMonth()}`,
    primary: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    isToday: false,
  };
}

/** e.g. "Nov 22, 07:26 PM" */
export function formatNoteTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Zero-padded countdown like "89:32" or "1:29:32". */
export function formatCountdown(remainingSeconds: number): string {
  const total = Math.max(0, Math.floor(remainingSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(secs).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

/** Filesystem-safe slug for download names. */
export function slugify(input: string, fallback = "note"): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return slug || fallback;
}
