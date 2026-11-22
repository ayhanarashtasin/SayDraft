import { exportEntries } from "@/server/export";
import { contentDisposition } from "@/server/files";
import { json } from "@/server/http";
import { libraryStats } from "@/server/notes";
import { route } from "@/server/route";
import { zipStream } from "@/server/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/export → ZIP with every note of the signed-in user (Markdown + JSON backup) and its audio. ?stats=1 returns library size instead. */
export const GET = route(async (request, _params, user) => {
  if (request.nextUrl.searchParams.get("stats") === "1") return json({ stats: await libraryStats(user.id) });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zipStream(exportEntries(user.id, request.signal)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`saydraft-export-${date}.zip`),
      "Cache-Control": "no-store",
    },
  });
});
