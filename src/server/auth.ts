import { createHash, timingSafeEqual } from "node:crypto";
import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, type SessionUser } from "../lib/auth-shared.ts";
import { HttpError, badRequest, conflict, isHostedHost } from "./http.ts";
import { authConfig, supabase } from "./supabase.ts";

/**
 * Accounts and sessions, on Supabase Auth.
 *
 * - Sign-in sessions live in HttpOnly cookies that only the server reads. The browser never talks to
 *   Supabase Auth and never sees a token.
 * - Every API request is checked with getUser(), which asks Supabase whether the session is still
 *   valid, so a logout (or a deleted account) takes effect immediately.
 * - The middleware only refreshes the session and gates pages, using the cheaper getClaims().
 * - Sign-up needs an invite code (SIGNUP_CODE), because every account spends the owner's OpenAI key.
 */

export type AuthUser = SessionUser;

export interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/** Cookies and headers the Supabase client wants written to the response. */
export interface PendingAuth {
  cookies: PendingCookie[];
  headers: Record<string, string>;
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

function isSecureRequest(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** A client bound to this request's cookies. Create one per request; never share it. */
export function createAuthClient(request: Request): { client: SupabaseClient; pending: PendingAuth } {
  const { url, key } = authConfig();
  const pending: PendingAuth = { cookies: [], headers: {} };
  const client = createServerClient(url, key, {
    cookieOptions: { path: "/", httpOnly: true, sameSite: "lax", secure: isSecureRequest(request), maxAge: SESSION_MAX_AGE_SEC },
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get("cookie") ?? ""),
      setAll: (cookies, headers) => {
        pending.cookies.push(...cookies);
        Object.assign(pending.headers, headers);
      },
    },
  });
  return { client, pending };
}

function mutable(response: Response): Response {
  try {
    response.headers.append("x-saydraft-probe", "1");
    response.headers.delete("x-saydraft-probe");
    return response;
  } catch {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) });
  }
}

/** Writes the cookies a Supabase call asked for (new session, refreshed session, cleared session) to a response. */
export function applyPending(response: Response, pending: PendingAuth): Response {
  if (pending.cookies.length === 0) return response;
  const target = mutable(response);
  for (const [name, value] of Object.entries(pending.headers)) target.headers.set(name, value);
  for (const { name, value, options } of pending.cookies) {
    target.headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
  }
  return target;
}

/** The request's headers with refreshed cookies merged in, so the route behind the middleware sees them. */
export function forwardedRequestHeaders(request: Request, pending: PendingAuth): Headers {
  const headers = new Headers(request.headers);
  if (pending.cookies.length === 0) return headers;
  const jar = new Map(parseCookieHeader(request.headers.get("cookie") ?? "").map((cookie) => [cookie.name, cookie.value]));
  for (const { name, value, options } of pending.cookies) {
    if (!value || options.maxAge === 0) jar.delete(name);
    else jar.set(name, value);
  }
  headers.set("cookie", [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "));
  return headers;
}

function toUser(id: string, email: unknown, metadata: unknown): AuthUser {
  const raw = metadata && typeof metadata === "object" ? (metadata as { name?: unknown }).name : undefined;
  const name = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, NAME_MAX) : null;
  return { id, email: typeof email === "string" ? email : "", name };
}

/** Quick check for the middleware: verifies the token's signature (refreshing it if it expired). */
export async function readClaims(request: Request): Promise<{ user: AuthUser | null; pending: PendingAuth }> {
  const { client, pending } = createAuthClient(request);
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { user: null, pending };
  return { user: toUser(claims.sub, claims.email, claims.user_metadata), pending };
}

/** Authoritative check for API calls: asks Supabase, so logged-out sessions and deleted accounts are refused at once. */
export async function requireUser(request: Request): Promise<{ user: AuthUser; pending: PendingAuth }> {
  const { client, pending } = createAuthClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return { user: toUser(data.user.id, data.user.email, data.user.user_metadata), pending };
}

// ---------------------------------------------------------------- sign up, sign in, sign out

function cleanEmail(value: unknown): string {
  if (typeof value !== "string") throw badRequest("Enter your email address.", "invalid_email");
  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest("Enter a valid email address.", "invalid_email");
  }
  return email;
}

function cleanPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < PASSWORD_MIN) {
    throw badRequest(`Use a password of at least ${PASSWORD_MIN} characters.`, "weak_password");
  }
  if (Buffer.byteLength(value) > PASSWORD_MAX) throw badRequest(`Use a password of at most ${PASSWORD_MAX} bytes.`, "weak_password");
  return value;
}

function cleanName(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw badRequest("Name must be text.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) throw badRequest(`Names can be up to ${NAME_MAX} characters.`);
  return name || null;
}

/**
 * Sign-up needs the invite code on a public domain and in any production build (the Host header can be
 * forged, so it is not trusted to mean "this computer"). Only `next dev` on localhost may skip it.
 */
export function signupCodeRequired(host: string): boolean {
  return Boolean(process.env.SIGNUP_CODE?.trim()) || process.env.NODE_ENV === "production" || isHostedHost(host);
}

function checkInviteCode(request: Request, supplied: unknown): void {
  const expected = process.env.SIGNUP_CODE?.trim() ?? "";
  if (!expected) {
    if (signupCodeRequired(request.headers.get("host") ?? "")) {
      throw new HttpError(503, "signup_closed", "Sign-up is closed. The owner has to set SIGNUP_CODE on the server first.");
    }
    return;
  }
  if (expected.length < 16) throw new HttpError(503, "signup_closed", "Sign-up is closed: SIGNUP_CODE must be at least 16 characters.");
  const digest = (text: string) => createHash("sha256").update(text).digest();
  if (typeof supplied !== "string" || !timingSafeEqual(digest(supplied.trim()), digest(expected))) {
    throw new HttpError(403, "invite_invalid", "That invite code is not valid.");
  }
}

function signUpError(error: { code?: string; message: string }): HttpError {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return conflict("An account with this email already exists. Log in instead.", "email_taken");
  }
  if (error.code === "weak_password") return badRequest("Choose a stronger password.", "weak_password");
  if (error.code === "validation_failed" || error.code === "email_address_invalid") return badRequest("Enter a valid email address.", "invalid_email");
  console.error("Sign-up failed:", error.message);
  return new HttpError(502, "auth_unavailable", "Could not create the account. Try again.");
}

export async function signIn(request: Request, emailInput: unknown, passwordInput: unknown): Promise<{ user: AuthUser; pending: PendingAuth }> {
  const email = cleanEmail(emailInput);
  if (typeof passwordInput !== "string" || !passwordInput) throw badRequest("Enter your password.", "invalid_credentials");
  const { client, pending } = createAuthClient(request);
  const { data, error } = await client.auth.signInWithPassword({ email, password: passwordInput });
  if (error || !data.user) {
    if (error?.code === "over_request_rate_limit") throw new HttpError(429, "rate_limited", "Too many attempts. Wait a minute and try again.");
    throw new HttpError(401, "invalid_credentials", "Wrong email or password.");
  }
  return { user: toUser(data.user.id, data.user.email, data.user.user_metadata), pending };
}

/** Creates the account (when the invite code is right) and signs the new user in. */
export async function signUp(request: Request, body: Record<string, unknown>): Promise<{ user: AuthUser; pending: PendingAuth }> {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password);
  const name = cleanName(body.name);
  checkInviteCode(request, body.inviteCode);
  // Created through the admin API, already confirmed: the invite code is the gate, so no email round trip is needed.
  const { error } = await supabase().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (error) throw signUpError(error);
  return signIn(request, email, password);
}

/** Ends this device's session and makes sure its cookies are cleared, even if the session was already invalid. */
export async function signOut(request: Request): Promise<PendingAuth> {
  const { client, pending } = createAuthClient(request);
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  const cleared = new Set(pending.cookies.filter((cookie) => !cookie.value).map((cookie) => cookie.name));
  for (const { name } of parseCookieHeader(request.headers.get("cookie") ?? "")) {
    if (AUTH_COOKIE.test(name) && !cleared.has(name)) {
      pending.cookies.push({
        name,
        value: "",
        options: { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: isSecureRequest(request) },
      });
    }
  }
  return pending;
}
