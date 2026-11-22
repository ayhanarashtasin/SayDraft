// Shared by the browser and the server: no Node or React imports here.

export const PASSWORD_MIN = 10;
/** bcrypt, which Supabase Auth uses, ignores everything after 72 bytes. */
export const PASSWORD_MAX = 72;
export const NAME_MAX = 60;
export const EMAIL_MAX = 254;

export const AUTH_PAGES = ["/login", "/signup"] as const;

/**
 * Accepts only a path on this site. Anything else (another domain, "//host", "/\host", a script URL)
 * becomes "/", so a login link can never send someone to another website.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  const pathname = raw.split(/[?#]/)[0];
  if ((AUTH_PAGES as readonly string[]).includes(pathname) || pathname.startsWith("/api/")) return "/";
  return raw;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}
