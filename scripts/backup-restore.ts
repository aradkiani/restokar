/**
 * Restores a backup produced by `npm run backup`.
 *
 *   npx tsx scripts/backup-restore.ts data/backups/restokar-backup-….tar.gz --yes
 *   npx tsx scripts/backup-restore.ts <archive>            (dry run: reports only)
 *   npx tsx scripts/backup-restore.ts <archive> --confirm=restokar --yes
 *
 * DESTRUCTIVE. Every table listed in the archive's manifest is emptied and
 * refilled. Without `--yes` the script only reads the archive and prints what it
 * would do, because the one thing worse than a missing backup is a restore
 * nobody meant to run.
 *
 * `--confirm=<dbname>` is an optional second lock: the operator states which
 * database they believe they are aimed at, and the run stops before reading
 * anything if that is not the database `DATABASE_URL` resolves to. It is
 * opt-in so that every existing invocation keeps working unchanged, but the
 * runbook always passes it — the accident it prevents is a command recalled
 * from shell history carrying last week's archive path and this week's
 * production connection string.
 *
 * The counterpart to src/lib/backup/export.ts. Written because a backup that
 * has never been restored is a guess, not a safety net — this is the file that
 * lets the procedure be rehearsed before it is needed.
 */
// MUST be first: populates process.env before src/lib/env.ts is evaluated.
import "./load-env";
import { gunzipSync } from "node:zlib";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { UPLOADS_ROOT } from "../src/lib/storage/paths";

interface TarEntry {
  name: string;
  content: Buffer;
}

/**
 * Minimal ustar reader — the mirror of the writer in src/lib/backup/archive.ts.
 *
 * Only what that writer emits is supported: regular files, no long-name
 * extensions, no sparse files. Anything else is skipped rather than guessed at.
 */
function readTar(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);

    // Two consecutive zero blocks mark end-of-archive.
    if (header.every((byte) => byte === 0)) break;

    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeField = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "");
    const size = parseInt(sizeField.trim(), 8) || 0;
    const typeFlag = header.subarray(156, 157).toString("ascii");

    offset += 512;

    if (typeFlag === "0" || typeFlag === "\0") {
      entries.push({ name, content: buffer.subarray(offset, offset + size) });
    }

    // Content is padded up to the next 512-byte boundary.
    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}

interface Manifest {
  product: string;
  createdAt: string;
  schemaMigration: string | null;
  tableOrder: string[];
  tableCounts: Record<string, number>;
  uploadCount: number;
}

/**
 * Columns held back on the first insert and written on a second pass.
 *
 * `Restaurant.ownerId` references `User` and `User.restaurantId` references
 * `Restaurant`. That is a cycle, and no flat table order can satisfy it: an
 * insert into whichever table comes first fails because the row it points at
 * does not exist yet. Restoring users used to fail on exactly this, one table
 * into the run.
 *
 * A two-pass insert works because the cycle has a nullable side.
 * `User.restaurantId` is nullable (`String?` — it is null for SUPER_ADMIN
 * accounts, which belong to no tenant), while `Restaurant.ownerId` is NOT NULL.
 * So users go in first with `restaurantId` held back, restaurants follow and
 * find their owners, and the held-back values are written afterwards. Nothing
 * about the schema changes, and no constraint is dropped, disabled or deferred
 * — every foreign key is enforced at every moment.
 *
 * The whole thing still runs inside one transaction, so a failure anywhere,
 * including in the second pass, rolls the target back to untouched.
 *
 * A table listed here must have an `id` column, which every model in this
 * schema does; the second pass keys on it.
 */
const DEFERRED_COLUMNS: Record<string, readonly string[]> = {
  User: ["restaurantId"],
};

/**
 * How long the restore transaction may run.
 *
 * Prisma's interactive transactions default to five seconds, which is a sane
 * limit for a request handler and far too short for this: the restore writes
 * every row the archive holds one INSERT at a time, and a modest development
 * dataset of ~51,000 rows blows through five seconds around the order table.
 * The restore then aborts and rolls back — safely, but never finishing.
 *
 * Thirty minutes is deliberately generous. A restore is a rare, supervised
 * operation run with the application stopped, so a long-held transaction costs
 * nothing, while a restore that dies four fifths of the way through costs an
 * incident. Raise it if a dataset ever needs longer; the work is bounded by the
 * archive, not by this number.
 */
const TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * The database `DATABASE_URL` actually resolves to.
 *
 * Read from the environment rather than from `src/lib/env.ts` so the guard
 * still answers when the connection string is malformed — a bad URL is the
 * connection's failure to report, and this check should not pre-empt it with a
 * less useful error. Returns null when there is nothing trustworthy to compare.
 */
function databaseNameFromUrl(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;

  try {
    return new URL(raw).pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
}

/**
 * Checks the operator's stated target against the real one.
 *
 * Returns an exit code to stop on, or null to continue. Runs before the archive
 * is opened, so a refusal has touched nothing at all.
 */
function checkConfirmedTarget(): number | null {
  const flag = process.argv.find((arg) => arg.startsWith("--confirm="));
  if (!flag) return null;

  const claimed = flag.slice("--confirm=".length).trim();
  const actual = databaseNameFromUrl();

  if (!claimed) {
    console.error("--confirm needs a database name, e.g. --confirm=restokar");
    return 1;
  }

  if (!actual) {
    console.error(
      "--confirm was given, but no database name could be read from DATABASE_URL.\n" +
        "Refusing to run rather than assuming the target is correct.",
    );
    return 1;
  }

  if (claimed !== actual) {
    console.error(
      `REFUSING TO RUN — wrong database.\n\n` +
        `  --confirm says:   ${claimed}\n` +
        `  DATABASE_URL is:  ${actual}\n\n` +
        `Nothing was read and nothing was written. Either point DATABASE_URL at ` +
        `"${claimed}", or correct --confirm to match the database you meant.`,
    );
    return 1;
  }

  console.log(`Target database confirmed: ${actual}`);
  return null;
}

/** Quotes an identifier for interpolation. Table names come from the manifest. */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to use an unexpected table name: ${name}`);
  }
  return `"${name}"`;
}

async function main() {
  const [archivePath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const confirmed = process.argv.includes("--yes");

  if (!archivePath) {
    console.error(
      "Usage: tsx scripts/backup-restore.ts <archive.tar.gz> [--confirm=<dbname>] [--yes]",
    );
    return 1;
  }

  // Before the archive is opened, so a refusal is a complete no-op.
  const refusal = checkConfirmedTarget();
  if (refusal !== null) return refusal;

  const entries = readTar(gunzipSync(readFileSync(path.resolve(archivePath))));
  const byName = new Map(entries.map((e) => [e.name, e.content]));

  const manifestRaw = byName.get("manifest.json");
  if (!manifestRaw) {
    console.error("No manifest.json in the archive — is this a Restokar backup?");
    return 1;
  }

  const manifest = JSON.parse(manifestRaw.toString("utf8")) as Manifest;
  if (manifest.product !== "restokar") {
    console.error(`Archive is for "${manifest.product}", not restokar.`);
    return 1;
  }

  // The schema the dump was taken against. Restoring a dump whose columns no
  // longer exist fails halfway through and leaves the database empty, so it is
  // called out before anything is deleted rather than discovered during.
  const live = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1
  `;
  const liveMigration = live[0]?.migration_name ?? null;

  console.log(`Archive taken:   ${manifest.createdAt}`);
  console.log(`Archive schema:  ${manifest.schemaMigration ?? "unknown"}`);
  console.log(`Database schema: ${liveMigration ?? "unknown"}`);
  if (manifest.schemaMigration !== liveMigration) {
    console.warn(
      "WARNING: schema versions differ. Run `npx prisma migrate deploy` to the " +
        "archive's version first, or expect column errors.",
    );
  }

  const uploadEntries = entries.filter((e) => e.name.startsWith("uploads/"));
  console.log(
    `\nWould restore ${manifest.tableOrder.length} table(s) and ` +
      `${uploadEntries.length} upload(s):`,
  );
  for (const table of manifest.tableOrder) {
    console.log(`  ${table.padEnd(24)} ${manifest.tableCounts[table] ?? 0}`);
  }

  if (!confirmed) {
    console.log("\nDry run. Re-run with --yes to apply. THIS REPLACES ALL DATA.");
    return 0;
  }

  console.log("\nRestoring…");

  // Column types for the whole schema, read once. `normalise` needs them to
  // tell a native array column from a json one.
  const typeRows = await prisma.$queryRaw<
    { table_name: string; column_name: string; udt_name: string }[]
  >`
    SELECT table_name, column_name, udt_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const columnType = new Map(
    typeRows.map((row) => [`${row.table_name}.${row.column_name}`, row.udt_name]),
  );

  await prisma.$transaction(
    async (tx) => {
      // Emptied in reverse dependency order, then filled forwards. CASCADE covers
      // the excluded tables (Session, RateLimit) that reference restored rows.
      for (const table of [...manifest.tableOrder].reverse()) {
        await tx.$executeRawUnsafe(
          `TRUNCATE TABLE ${quoteIdent(table)} RESTART IDENTITY CASCADE`,
        );
      }

      // Values held back by DEFERRED_COLUMNS, replayed once every table is in.
      const deferredWrites: {
        table: string;
        id: unknown;
        values: Record<string, unknown>;
      }[] = [];

      for (const table of manifest.tableOrder) {
        const chunks = entries
          .filter((e) => new RegExp(`^database/${table}(\\.\\d+)?\\.json$`).test(e.name))
          .sort((a, b) => a.name.localeCompare(b.name));

        const deferred = DEFERRED_COLUMNS[table] ?? [];

        let restored = 0;
        for (const chunk of chunks) {
          const rows = JSON.parse(chunk.content.toString("utf8")) as Record<
            string,
            unknown
          >[];
          if (rows.length === 0) continue;

          const columns = Object.keys(rows[0]!);
          const columnList = columns.map(quoteIdent).join(", ");

          if (deferred.length > 0 && !columns.includes("id")) {
            throw new Error(
              `${table} has deferred columns but no id column to key the second pass on.`,
            );
          }

          for (const row of rows) {
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
            const values = columns.map((column) =>
              deferred.includes(column)
                ? null
                : normalise(row[column], columnType.get(`${table}.${column}`)),
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${placeholders})`,
              ...values,
            );

            // Only rows that actually carried a value need revisiting; a
            // SUPER_ADMIN's null restaurantId is already correct.
            if (
              deferred.some((column) => row[column] !== null && row[column] !== undefined)
            ) {
              deferredWrites.push({
                table,
                id: row.id,
                values: Object.fromEntries(
                  deferred.map((column) => [column, row[column]]),
                ),
              });
            }

            restored += 1;
          }
        }
        console.log(`  ${table.padEnd(24)} ${restored}`);
      }

      // Second pass: the cycle's nullable side, now that both ends exist.
      for (const write of deferredWrites) {
        const columns = Object.keys(write.values);
        const assignments = columns
          .map((column, i) => `${quoteIdent(column)} = $${i + 1}`)
          .join(", ");

        await tx.$executeRawUnsafe(
          `UPDATE ${quoteIdent(write.table)} SET ${assignments} WHERE "id" = $${columns.length + 1}`,
          ...columns.map((column) =>
            normalise(write.values[column], columnType.get(`${write.table}.${column}`)),
          ),
          write.id,
        );
      }

      if (deferredWrites.length > 0) {
        console.log(`  ${"(deferred refs)".padEnd(24)} ${deferredWrites.length}`);
      }
    },
    {
      timeout: TRANSACTION_TIMEOUT_MS,
      // Time to wait for a connection before giving up. The default two seconds
      // is tight when the pool is busy, and failing here wastes the whole run.
      maxWait: 30_000,
    },
  );

  for (const entry of uploadEntries) {
    const relative = entry.name.slice("uploads/".length);
    const target = path.join(UPLOADS_ROOT, ...relative.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.content);
  }
  console.log(`  uploads${" ".repeat(17)} ${uploadEntries.length}`);

  console.log("\nRestore complete.");
  return 0;
}

/**
 * JSON gives back strings for timestamps; Postgres wants something it can cast.
 * Objects are re-serialised for json/jsonb columns.
 *
 * `udtName` decides what to do with an array, and getting it wrong is not a
 * detail: Postgres writes a native array as `{a,b}` and JSON as `[a,b]`, and it
 * rejects each in the other's column. Stringifying everything made
 * `User.staffTabs` (`_text`) fail with `malformed array literal: "[]"` on the
 * first account restored. Passing everything through would break the three
 * `jsonb` columns instead.
 *
 * So native array columns — `_`-prefixed in `udt_name`, which is
 * `User.staffTabs` and `Restaurant.tipPercents` today — hand the JS array
 * straight to the driver, which builds the `{…}` literal itself. Everything
 * else keeps the old behaviour.
 *
 * Neither array column existed when the last restorable archive was taken,
 * which is why this surfaced only once the restore got far enough to reach
 * them.
 */
function normalise(value: unknown, udtName: string | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && udtName?.startsWith("_")) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("Restore failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
