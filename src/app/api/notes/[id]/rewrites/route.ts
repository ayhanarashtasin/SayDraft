import { after } from "next/server";
import { HttpError, badRequest, parseId, readJson } from "@/server/http";
import { getRewriteById } from "@/server/notes";
import { type RewriteRequest, prepareRewrite } from "@/server/rewrite";
import { route } from "@/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = route<{ id: string }>(async (request, params, user) => {
  const noteId = parseId(params.id, "note id");
  const body = await readJson(request);
  const rewriteRequest: RewriteRequest = {};
  if (body.promptId !== undefined) rewriteRequest.promptId = parseId(String(body.promptId), "prompt id");
  if (body.instruction !== undefined) {
    if (typeof body.instruction !== "string") throw badRequest("instruction must be text.");
    rewriteRequest.instruction = body.instruction;
  }
  if (body.translateTo !== undefined) {
    if (typeof body.translateTo !== "string") throw badRequest("translateTo must be a language code.");
    rewriteRequest.translateTo = body.translateTo;
  }
  if (body.sourceRewriteId !== undefined && body.sourceRewriteId !== null) {
    rewriteRequest.sourceRewriteId = parseId(String(body.sourceRewriteId), "source version");
  }

  const prepared = await prepareRewrite(user.id, noteId, rewriteRequest);
  const encoder = new TextEncoder();
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      send({ type: "start", rewrite: prepared.rewrite });
      const work = prepared
        .run((text) => send({ type: "delta", text }))
        .then((rewrite) => send({ type: "done", rewrite }))
        .catch(async (error: unknown) => {
          const known = error instanceof HttpError;
          send({
            type: "error",
            error: {
              code: known ? error.code : "rewrite_failed",
              message: known ? error.message : "The rewrite failed. Try again.",
            },
            rewrite: await getRewriteById(user.id, prepared.rewrite.id).catch(() => null),
          });
        })
        .finally(() => {
          if (!open) return;
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        });
      after(work);
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
