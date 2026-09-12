import { getSessionUser } from "@/lib/auth/session";
import { sseFrame, subscribeToRestaurant } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live order feed for the kitchen board.
 *
 * The stream is bound to the restaurant on the caller's *session*, so a client
 * cannot subscribe to another venue's traffic by passing a different id.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.restaurantId) return new Response("Forbidden", { status: 403 });

  const restaurantId = user.restaurantId;
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
       * Declared before anything that can fail so every failure path reaches
       * it. Previously a failed `enqueue` only set `closed`, which made the
       * heartbeat a no-op but never cleared it — so each kitchen tab that went
       * away left a timer and a bus listener running for the life of the
       * process. Over a service that is a slow leak of both memory and wakeups.
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

      send("ready", { at: new Date().toISOString() });

      unsubscribe = subscribeToRestaurant(restaurantId, (payload) => {
        const event =
          payload.type === "order.created"
            ? "created"
            : payload.type === "staff.called"
              ? "staff-called"
              : "updated";
        send(event, payload);
      });

      heartbeat = setInterval(() => enqueue(": ping\n\n"), 25_000);

      // A request aborted before `start` runs would never fire the listener,
      // leaving the subscription attached to a connection that is already gone.
      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", cleanup, { once: true });
    },
    // Fires when the consumer cancels rather than aborts — a separate path from
    // the abort signal, and one that leaks the same way if left unhandled.
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
