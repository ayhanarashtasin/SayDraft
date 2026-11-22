import { applyPending, signOut } from "@/server/auth";
import { json } from "@/server/http";
import { publicRoute } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ends this device's session and clears its cookies. Works even if the session already expired. */
export const POST = publicRoute(async (request) => {
  const pending = await signOut(request);
  return applyPending(json({ ok: true }), pending);
});
