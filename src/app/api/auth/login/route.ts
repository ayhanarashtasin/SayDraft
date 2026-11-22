import { applyPending, signIn } from "@/server/auth";
import { json, readJson } from "@/server/http";
import { publicRoute } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** { email, password } → signs in (session cookies are set). */
export const POST = publicRoute(async (request) => {
  const body = await readJson(request, 10_000);
  const { user, pending } = await signIn(request, body.email, body.password);
  return applyPending(json({ user }), pending);
});
