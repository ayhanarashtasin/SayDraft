import { json, route } from "@/server/http";
import { appStatus } from "@/server/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json(await appStatus()));
