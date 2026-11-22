import { applyPending, signUp } from "@/server/auth";
import { json, readJson } from "@/server/http";
import { publicRoute } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** { name?, email, password, inviteCode } → creates the account and signs it in (session cookies are set). */
export const POST = publicRoute(async (request) => {
  const body = await readJson(request, 10_000);
  const { user, pending } = await signUp(request, body);
  return applyPending(json({ user }, { status: 201 }), pending);
});
