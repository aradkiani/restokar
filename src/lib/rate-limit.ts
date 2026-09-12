import "server-only";
import { prisma } from "./prisma";
import { env } from "./env";

/**
 * Fixed-window limiter for the endpoints an unauthenticated caller can reach
 * (login, registration, order placement, staff calls) and for the few
 * authenticated ones that mint credentials or write files.
 *
 * The counter lives in Postgres rather than in process memory. The app is
 * deployed as several Node instances behind one proxy — a single instance
 * saturates at ~240 req/s while using 1.3 of 24 cores — and a per-process
 * counter would hand an attacker N times the intended allowance without them
 * having to do anything clever about which instance they reach.
 *
 * The increment is one atomic `INSERT … ON CONFLICT DO UPDATE`, so two
 * simultaneous requests cannot both read the pre-increment value and both be
 * allowed through. Read-then-write in application code would have exactly that
 * race, and it is the race that matters for a password-guessing limit.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface CounterRow {
  count: number;
  resetAt: Date;
}

export async function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  try {
    // `count` is reset to 1 rather than incremented when the stored window has
    // already elapsed, which is what makes this a fixed window rather than a
    // counter that only ever grows.
    const rows = await prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}::int))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."resetAt" <= now() THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimit"."resetAt" <= now()
          THEN now() + make_interval(secs => ${windowSeconds}::int)
          ELSE "RateLimit"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;

    const row = rows[0];
    if (!row) return allow(limit);

    const allowed = row.count <= limit;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));

    return {
      allowed,
      remaining: Math.max(0, limit - row.count),
      retryAfterSeconds,
    };
  } catch (error) {
    // Fail open. A limiter that closes the door when its storage is unreachable
    // turns a database blip into a total outage, and the endpoints behind it
    // still have their real authorisation checks. The failure is logged so it
    // does not become a silent hole.
    console.error("[rate-limit] counter unavailable, allowing request", error);
    return allow(limit);
  }
}

function allow(limit: number): RateLimitResult {
  return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
}

/**
 * Clears a counter after the action it guards succeeded.
 *
 * Without this, the login limiter counts *every* attempt, so someone who signs
 * in correctly 8 times in 15 minutes — a shared kitchen tablet, or anyone
 * switching accounts — gets locked out despite never failing. Only failed
 * attempts should accumulate.
 */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } }).catch(() => undefined);
}

/**
 * Drops windows that have already elapsed.
 *
 * Called from the scheduled maintenance job rather than from a request: the
 * table is keyed by an opaque string and would otherwise accumulate one dead
 * row per address that ever hit a limited endpoint.
 */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return count;
}

/**
 * Best-effort client address, read from the right-hand end of the forwarding
 * chain.
 *
 * This used to take the *first* entry of `x-forwarded-for`, which is the one
 * value in the header an attacker fully controls: nginx's standard
 * `proxy_add_x_forwarded_for` appends its own view of the peer to whatever the
 * client sent, so a request carrying `X-Forwarded-For: <random>` arrives as
 * `<random>, <real ip>`. Reading the leftmost entry meant every request could
 * present a fresh identity and no per-IP limit applied at all.
 *
 * `TRUSTED_PROXY_HOPS` is how many proxies of our own sit in front of the app —
 * one for the documented nginx deployment. The entry that many places from the
 * right is the address the outermost trusted proxy actually saw, and is the
 * last one the client could not forge.
 *
 * Never use this for authorisation; it identifies a network path, not a person.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (chain.length > 0) {
      const hops = Math.min(Math.max(env.TRUSTED_PROXY_HOPS, 1), chain.length);
      return chain[chain.length - hops]!;
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
