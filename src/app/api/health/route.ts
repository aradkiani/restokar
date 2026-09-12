import { access, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { UPLOADS_ROOT } from "@/lib/storage/paths";
import pkg from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness probe.
 *
 * Answers the only question that matters at 3am: is this process able to do its
 * job, and if not, which of the three things it depends on has gone. Those three
 * are the database, the customer-data disk being writable, and there being room
 * left on it — the failures that take the site down without the process dying,
 * which is exactly the class a plain "is the port open" check misses.
 *
 * Deliberately outside the auth guards. A probe that needs a session cannot run
 * from nginx, from a cron line, or from an operator who has just been woken up
 * and cannot sign in because the database is the thing that is down.
 *
 * It therefore has to be safe to expose. Every value below is either a boolean,
 * a byte count, or a version string: nothing here reports a path, an origin, a
 * connection string, a table name or any other piece of configuration. The
 * failure detail stays in the server log, where it is already going.
 */

/**
 * Per-check budget.
 *
 * The endpoint has to answer in under a second even when a dependency is
 * hanging, because the common reason to call it is that something is already
 * wrong — and a health check that blocks on the same dead socket as the app is
 * one more thing that is down rather than the thing that tells you so. A check
 * that overruns is reported as failed, which is the honest answer: a database
 * that cannot answer `SELECT 1` inside half a second is not serving requests.
 *
 * Three checks run concurrently, so the worst case is one budget, not three.
 */
const CHECK_TIMEOUT_MS = 500;

/** Resolves to `fallback` if the work throws or overruns the budget. */
async function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    // Without this the timer holds the event loop open after the response has
    // already gone out.
    if (timer) clearTimeout(timer);
  }
}

/** Can we reach Postgres and get an answer back? */
async function checkDatabase(): Promise<boolean> {
  return withTimeout(
    prisma.$queryRaw`SELECT 1`.then(() => true),
    false,
  );
}

/**
 * Can we still write customer uploads?
 *
 * `access` rather than an actual write: it is one syscall instead of three and
 * leaves nothing behind to clean up. It does not catch a full disk — that is
 * what the free-space figure beside it is for.
 */
async function checkUploadsWritable(): Promise<boolean> {
  return withTimeout(
    access(UPLOADS_ROOT, constants.W_OK).then(() => true),
    false,
  );
}

/**
 * Bytes available on the volume holding customer data.
 *
 * `bavail` rather than `bfree` — the latter counts blocks reserved for root,
 * which this process cannot use and should not be told it has. `null` means the
 * figure could not be read, which is itself worth seeing.
 */
async function checkDiskFree(): Promise<number | null> {
  return withTimeout(
    statfs(UPLOADS_ROOT).then((stats) => Number(stats.bavail) * Number(stats.bsize)),
    null,
  );
}

export async function GET() {
  const startedAt = Date.now();

  const [database, uploadsWritable, diskFreeBytes] = await Promise.all([
    checkDatabase(),
    checkUploadsWritable(),
    checkDiskFree(),
  ]);

  // The database is the only hard dependency: without it nothing renders, so
  // that is the one failure worth reporting as a non-200 for `curl -f` and for
  // an nginx upstream check. A read-only uploads directory is serious but the
  // menus still serve, so it is reported in the body without failing the probe.
  const healthy = database;

  return ok(
    {
      status: healthy ? "ok" : "degraded",
      version: pkg.version,
      // Set at build or deploy time: `GIT_COMMIT=$(git rev-parse --short HEAD)`.
      // Null rather than absent so the field's shape never changes.
      commit: process.env.GIT_COMMIT ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, uploadsWritable, diskFreeBytes },
      durationMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      // A cached health check reports the state of a moment that has passed.
      headers: { "cache-control": "no-store" },
    },
  );
}
