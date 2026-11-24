import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PAGES, safeNext } from "./lib/auth-shared";
import { type PendingAuth, applyPending, forwardedRequestHeaders, readClaims } from "./server/auth";
import { HttpError, errorResponse, guardHost } from "./server/http";

/** Routes that work without a session. Everything else needs one. */
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/signup", "/api/auth/logout"]);

/**
 * Runs before every page and API request: checks the host, refreshes the sign-in session once per
 * request (so the route behind it sees fresh cookies), and keeps signed-out visitors on the login page.
 * API routes check the session again on their own (see route.ts).
 */
export async function middleware(request: NextRequest): Promise<Response> {
  try {
    guardHost(request);
  } catch (error) {
    return errorResponse(error);
  }

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isAuthPage = (AUTH_PAGES as readonly string[]).includes(pathname);
  const isPublic = isAuthPage || PUBLIC_API.has(pathname);

  let user = null;
  let pending: PendingAuth = { cookies: [], headers: {} };
  try {
    ({ user, pending } = await readClaims(request));
  } catch (error) {
    // Sign-in is not configured or Supabase is unreachable: nobody can be let in.
    console.error("Session check failed:", error instanceof Error ? error.message : error);
    if (!isPublic) {
      return isApi
        ? errorResponse(new HttpError(503, "auth_unavailable", "Sign-in is not available right now. Try again in a moment."))
        : new Response("Sign-in is not available right now. Try again in a moment.", { status: 503 });
    }
  }

  if (!user && !isPublic) {
    if (isApi) return applyPending(errorResponse(new HttpError(401, "unauthenticated", "Sign in to continue.")), pending);
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const next = safeNext(pathname + search);
    if (next !== "/") login.searchParams.set("next", next);
    return applyPending(NextResponse.redirect(login), pending);
  }

  if (user && isAuthPage) {
    const target = request.nextUrl.clone();
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    const [nextPath, nextQuery = ""] = next.split("?");
    target.pathname = nextPath;
    target.search = nextQuery ? `?${nextQuery}` : "";
    return applyPending(NextResponse.redirect(target), pending);
  }

  const response = NextResponse.next({ request: { headers: forwardedRequestHeaders(request, pending) } });
  return applyPending(response, pending);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|apple-touch-icon\\.png|manifest\\.webmanifest|icons/|dashboard-bg/|\\.well-known/workflow/).*)"],
  runtime: "nodejs",
};
