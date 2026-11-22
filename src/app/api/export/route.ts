import { exportEntries } from "@/server/export";
import { contentDisposition } from "@/server/files";
import { json, route } from "@/server/http";
import { libraryStats } from "@/server/notes";
import { zipStream } from "@/server/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/export → ZIP with every note (Markdown + JSON backup) and its audio. ?stats=1 returns library size instead. */
export const GET = route(async (request) => {
  if (request.nextUrl.searchParams.get("stats") === "1") return json({ stats: await libraryStats() });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zipStream(exportEntries(request.signal)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`saydraft-export-${date}.zip`),
      "Cache-Control": "no-store",
    },
  });
});
