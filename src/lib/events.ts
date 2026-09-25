import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { env } from "./env";

/**
 * Pub/sub backing the kitchen board and the guest's live order status.
 *
 * Delivery goes through Postgres `LISTEN`/`NOTIFY` rather than a bare
 * in-process emitter, because the app cannot be run on one core.
 *
 * Measured: a single Node process saturates at ~240 req/s while using 1.3 of
 * 24 cores — Next.js is one process with one event loop, so the only way to use
 * the rest of a machine is to run several instances behind a load balancer. The
 * previous in-process `EventEmitter` made that unsafe: a guest whose SSE stream
 * landed on instance A would never see the status change published on instance
 * B, and the bug would look like "the order tracker sometimes doesn't update"
 * rather than like a deployment topology problem.
 *
 * Postgres is used because it is already a hard dependency — this needs no
 * Redis, no new service, and nothing that has to be reachable from Iran.
 *
 * Two properties worth keeping in mind:
 *
 *   * `NOTIFY` reaches *every* listening session including the one that sent
 *     it, so publish deliberately does not also emit locally — that would
 *     deliver each event twice on the originating instance.
 *   * If the listener connection drops, delivery stops until it reconnects.
 *     Both consumers already poll on an interval, so the failure mode is a
 *     delayed update rather than a lost one.
 */

export type OrderEventType = "order.created" | "order.updated" | "staff.called";

export interface OrderEventPayload {
  type: OrderEventType;
  restaurantId: string;
  /** Absent on a staff call, which is not tied to an order. */
  orderId?: string;
  publicToken?: string;
  status?: string;
  /** Set on `staff.called` so the board can name the table straight away. */
  tableNumber?: string;
  at: string;
}

/**
 * One channel for everything, with the restaurant id inside the payload.
 *
 * Postgres channel names are identifiers, so a per-restaurant channel would
 * mean issuing `LISTEN` for every venue an instance currently has a subscriber
 * for — and un-listening as they disconnect. At a hundred venues that is a lot
 * of session churn to save a filter that costs a string comparison.
 */
const CHANNEL = "restokar_events";

const globalForBus = globalThis as unknown as {
  restokarBus?: EventEmitter;
  restokarListener?: Promise<Client | null>;
};

function getBus(): EventEmitter {
  if (!globalForBus.restokarBus) {
    const bus = new EventEmitter();
    // A busy venue can have many kitchen tabs plus every guest tracking an
    // order; the default limit of 10 would log spurious leak warnings.
    bus.setMaxListeners(0);
    globalForBus.restokarBus = bus;
  }
  return globalForBus.restokarBus;
}

const channelKey = (restaurantId: string) => `restaurant:${restaurantId}`;

/**
 * The dedicated listening connection.
 *
 * Separate from the Prisma pool on purpose: `LISTEN` binds to a session, and a
 * pooled connection can be handed to another query and lose the subscription.
 * Created once per instance, on first subscribe, so a process that never serves
 * an SSE stream never opens it.
 */
function getListener(): Promise<Client | null> {
  globalForBus.restokarListener ??= connectListener();
  return globalForBus.restokarListener;
}

async function connectListener(): Promise<Client | null> {
  try {
    const client = new Client({ connectionString: env.DATABASE_URL });

    client.on("notification", (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      try {
        const payload = JSON.parse(message.payload) as OrderEventPayload;
        getBus().emit(channelKey(payload.restaurantId), payload);
      } catch {
        // A malformed payload is not worth taking the listener down for.
      }
    });

    client.on("error", () => {
      // Drop the memoised promise so the next subscriber reconnects. Polling
      // covers the gap in the meantime.
      globalForBus.restokarListener = undefined;
      client.end().catch(() => {});
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    return client;
  } catch {
    globalForBus.restokarListener = undefined;
    return null;
  }
}

/**
 * Broadcasts to every instance.
 *
 * Deliberately fire-and-forget: an order must still be created if the
 * notification cannot be delivered, so a failure here is swallowed rather than
 * failing the request that triggered it. The boards poll.
 */
export function publishOrderEvent(payload: OrderEventPayload): void {
  void notify(payload).catch(() => {});
}

async function notify(payload: OrderEventPayload): Promise<void> {
  const client = await getListener();
  if (!client) {
    // No cross-instance path available — fall back to local delivery so a
    // single-instance deployment still works when Postgres pub/sub is down.
    getBus().emit(channelKey(payload.restaurantId), payload);
    return;
  }
  // Parameterised: the payload contains venue-supplied text (a table number),
  // and NOTIFY takes a string literal that would otherwise need escaping.
  await client.query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify(payload)]);
}

export function subscribeToRestaurant(
  restaurantId: string,
  listener: (payload: OrderEventPayload) => void,
): () => void {
  // Opens the shared listening connection on first use; later subscribers reuse
  // it. Not awaited — the caller is inside a stream `start()` and a subscriber
  // that attaches a few milliseconds later still gets every subsequent event.
  void getListener();

  const bus = getBus();
  const key = channelKey(restaurantId);
  bus.on(key, listener);
  return () => {
    bus.off(key, listener);
  };
}

/** Formats a payload as an SSE frame. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
