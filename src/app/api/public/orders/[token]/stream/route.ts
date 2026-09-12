import { prisma } from "@/lib/prisma";
import { sseFrame, subscribeToRestaurant } from "@/lib/events";

export const runtime = "nodejs";
// A live stream must never be served from a cache.
export const dynamic = "force-dynamic";

/**
 * Server-sent events for a single guest's order.
 *
 * SSE rather than WebSockets: the traffic is one-directional, it survives
 * ordinary HTTP infrastructure, and browsers reconnect automatically — which
 * matters on the patchy mobile connections this runs over.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, restaurantId: true, status: true },
  });

  if (!order) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();

  let release = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      // Explicitly initialised so `cleanup` below can close over them before
      // they are assigned, without prefer-const objecting to a single write.
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
      let unsubscribe: (() => void) | undefined = undefined;

      /**
       * Tears the subscription down exactly once.
       *
       * Declared first so every failure path reaches it. A failed `enqueue`
       * used to set `closed` without clearing the heartbeat, so a guest who
       * closed their tracking tab left a timer and a bus listener behind. This
       * endpoint is public and one order can be tracked from several phones, so
       * it leaks faster than the staff-facing stream.
       */
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      release = cleanup;

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const send = (event: string, data: unknown) => enqueue(sseFrame(event, data));

      send("status", { status: order.status });

      unsubscribe = subscribeToRestaurant(order.restaurantId, (payload) => {
        if (payload.orderId === order.id) {
          send("status", { status: payload.status, at: payload.at });
        }
      });

      // Proxies commonly drop idle connections after ~60s; a comment frame
      // keeps the pipe warm without producing a client-visible event.
      heartbeat = setInterval(() => enqueue(": ping\n\n"), 25_000);

      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Stops nginx buffering the stream into uselessness.
      "x-accel-buffering": "no",
    },
  });
}
