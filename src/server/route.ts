import type { NextRequest } from "next/server";
import { type AuthUser, applyPending, requireUser } from "./auth.ts";
import { errorResponse, guardRequest } from "./http.ts";

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps an API route handler: host and cross-site guard, then the signed-in user (401 without one),
 * then uniform JSON errors. The handler gets the user as its third argument and must pass user.id to
 * everything it reads or writes. Refreshed session cookies are added to the response.
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (request: NextRequest, params: P, user: AuthUser) => Promise<Response> | Response,
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      guardRequest(request);
      const { user, pending } = await requireUser(request);
      const params = context?.params ? await context.params : ({} as P);
      return applyPending(await handler(request, params, user), pending);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** For the few routes that must work without a session: log in, sign up and log out. */
export function publicRoute<P extends Record<string, string> = Record<string, never>>(
  handler: (request: NextRequest, params: P) => Promise<Response> | Response,
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      guardRequest(request);
      const params = context?.params ? await context.params : ({} as P);
      return await handler(request, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
