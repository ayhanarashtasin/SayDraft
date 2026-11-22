import { json } from "@/server/http";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user (401 when there is no valid session). */
export const GET = route(async (_request, _params, user) => json({ user }));
