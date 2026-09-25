import { access, readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { ok } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { BACKUPS_ROOT, UPLOADS_ROOT } from "@/lib/storage/paths";
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

interface BackupHealth {
  /** When the newest archive was written, or null if there is not one. */
  lastSuccessAt: string | null;
  /** Its age in hours, to one decimal. Null when there is no archive. */
  ageHours: number | null;
  /** A backup exists and is inside BACKUP_MAX_AGE_HOURS. */
  succeeded: boolean;
}

const NO_BACKUP: BackupHealth = {
  lastSuccessAt: null,
  ageHours: null,
  succeeded: false,
};

/**
 * Age of the newest backup archive.
 *
 * Read from the archive directory rather than from the `PlatformSetting` row
 * the backup also writes, because only one of the two actually proves a backup
 * exists. That row records the outcome of the scheduled *delivery* run and is
 * stamped on every attempt, success or failure; an archive written by any other
 * path never touches it. On this machine it read `failed` from August while a
 * good archive from September sat on disk. The file is the backup — its
 * presence is the evidence, and its mtime is when the evidence was produced.
 *
 * Filenames carry an ISO timestamp and are therefore in chronological order
 * lexically, which is the same assumption the pruner in backup/run.ts makes, so
 * only the newest needs stat-ing rather than all of them.
 *
 * Nothing here leaves the server but a timestamp, a number and a boolean: no
 * path, no filename, no error text. An unauthenticated caller learns whether
 * backups are running, which is the point, and nothing about where they go.
 */
async function checkBackup(): Promise<BackupHealth> {
  return withTimeout(
    (async () => {
      const names = await readdir(BACKUPS_ROOT);
      const archives = names
        .filter((n) => n.startsWith("restokar-backup-") && n.endsWith(".tar.gz"))
        .sort();

      const newest = archives.at(-1);
      if (!newest) return NO_BACKUP;

      const { mtime } = await stat(path.join(BACKUPS_ROOT, newest));
      const ageHours = (Date.now() - mtime.getTime()) / 3_600_000;

      return {
        lastSuccessAt: mtime.toISOString(),
        ageHours: Math.round(ageHours * 10) / 10,
        succeeded: ageHours <= env.BACKUP_MAX_AGE_HOURS,
      };
    })(),
    // A missing or unreadable backups directory is indistinguishable from
    // never having taken one, and both deserve the same answer.
    NO_BACKUP,
  );
}

export async function GET() {
  const startedAt = Date.now();

  const [database, uploadsWritable, diskFreeBytes, backup] = await Promise.all([
    checkDatabase(),
    checkUploadsWritable(),
    checkDiskFree(),
    checkBackup(),
  ]);

  // Two conditions fail the probe. The database, because without it nothing
  // renders. And a stale or absent backup, because the alternative is what
  // already happened once: the schedule broke, said so only in a log file, and
  // ran for eight days with nobody aware. A backup nobody is watching is not a
  // backup, so "no recent backup" is a 503 even though every page still serves.
  //
  // A read-only uploads directory stays a body-only signal: menus still serve
  // and orders still take, so it is a problem to fix rather than an outage.
  const healthy = database && backup.succeeded;

  return ok(
    {
      status: healthy ? "ok" : "degraded",
      version: pkg.version,
      // Set at build or deploy time: `GIT_COMMIT=$(git rev-parse --short HEAD)`.
      // Null rather than absent so the field's shape never changes.
      commit: process.env.GIT_COMMIT ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, uploadsWritable, diskFreeBytes, backup },
      durationMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      // A cached health check reports the state of a moment that has passed.
      headers: { "cache-control": "no-store" },
    },
  );
}
