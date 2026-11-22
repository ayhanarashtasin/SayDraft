import { json } from "@/server/http";
import { route } from "@/server/route";
import { appStatus } from "@/server/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, _params, user) => json(await appStatus(user.id)));
