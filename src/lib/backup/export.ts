import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma";
import { BACKUPS_ROOT, UPLOADS_ROOT } from "../storage/paths";
import { writeTarGz, type ArchiveEntry } from "./archive";

/**
 * Produces a complete backup of everything a customer owns.
 *
 * Two things live outside the core project and cannot be regenerated from it:
 * the database rows, and the images under DATA_DIR/uploads. This takes both.
 *
 * It deliberately replaces the older `scripts/db-snapshot.ts` approach of
 * listing tables by hand, which had drifted to cover 14 of them and silently
 * omitted six — including `AuditLog`, `ProductOptionGroup` and
 * `ProductOptionChoice`, so a restore from one of those snapshots would have
 * quietly dropped every add-on a venue sells and the whole security trail. Here
 * the table list is asserted against the live schema at run time instead, and a
 * table nobody remembered to add is an error rather than a silent gap.
 */

/**
 * Restore order: parents before children.
 *
 * Written down rather than derived, because a restore has to apply these in an
 * order that satisfies the foreign keys, and the person doing the restore
 * should not have to work that out during an incident.
 *
 * One edge is deliberately *not* satisfiable here: `Restaurant.ownerId`
 * references `User` and `User.restaurantId` references `Restaurant`, so no flat
 * ordering can put both children after both parents. `User` is listed first and
 * the restore writes `restaurantId` on a second pass — see DEFERRED_COLUMNS in
 * scripts/backup-restore.ts. Changing the relative position of `User` and
 * `Restaurant` here without reading that will produce a restore that fails on
 * its second table.
 *
 * `export.test.ts` asserts this list still covers every model in the Prisma
 * schema. That test exists because this list silently fell eleven tables behind
 * between 2026-09-04 and 2026-09-12, and the completeness check below — which
 * only runs when a backup is actually taken — reported it as a hard failure
 * that nobody was reading.
 */
const TABLE_ORDER = [
  "Plan",
  "User",
  "Restaurant",
  "Subscription",
  "SubscriptionExtension",
  "Category",
  "Product",
  "ProductOptionGroup",
  "ProductOptionChoice",
  "ProductInfoSection",
  "RestaurantTable",
  "StaffCall",
  // Both are referenced by Order, so they precede it.
  "Customer",
  "Campaign",
  "Order",
  "OrderItem",
  "OrderItemOption",
  "OrderEvent",
  "Expense",
  "Payment",
  "AuditLog",
  "PlatformSetting",
  "AvailabilityWindow",
  "DiscountCode",
  "FeaturedProductEvent",
  // InventoryItem precedes the two tables that reference it.
  "InventoryItem",
  "ProductIngredient",
  "ProductRecommendation",
  "RecommendationEvent",
  "StockMovement",
  "SupportTicket",
  "MenuDailyView",
  // After Order, which it references.
  "OrderReview",
] as const;

/**
 * Tables deliberately left out, and why.
 *
 * `Session` is live authentication state: it expires on its own, restoring it
 * would resurrect sign-ins that should have died with the incident, and there
 * is no reason to put session identifiers in a file that travels by email.
 * `RateLimit` is a set of counters that are meaningless minutes later.
 * `_prisma_migrations` describes the schema, which is part of the core project
 * and comes back with the code.
 */
const EXCLUDED_TABLES = new Set(["Session", "RateLimit", "_prisma_migrations"]);

/** Rows per archive entry — bounds peak memory on the large order tables. */
const ROWS_PER_CHUNK = 5_000;

export interface BackupResult {
  filePath: string;
  fileName: string;
  bytes: number;
  tableCounts: Record<string, number>;
  uploadCount: number;
  uploadBytes: number;
  startedAt: Date;
  finishedAt: Date;
}

/**
 * Confirms the hard-coded list still matches the database.
 *
 * This is the check that stops the previous bug recurring. A table added by a
 * future migration and not added here would otherwise be missing from every
 * backup taken afterwards, and nobody finds out until a restore.
 */
async function assertTableListIsComplete(): Promise<void> {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;

  const live = new Set(rows.map((r) => r.table_name));
  const covered = new Set<string>([...TABLE_ORDER, ...EXCLUDED_TABLES]);

  const missing = [...live].filter((name) => !covered.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Backup would omit ${missing.length} table(s): ${missing.join(", ")}. ` +
        "Add them to TABLE_ORDER in src/lib/backup/export.ts (or to EXCLUDED_TABLES " +
        "with a reason) before relying on this backup.",
    );
  }
}

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM "${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function fetchChunk(table: string, offset: number): Promise<unknown[]> {
  // Table names come from TABLE_ORDER above — a constant in this file, never
  // from a request — and are additionally proven to exist by the schema check.
  // Ordering by the primary key keeps paging stable across chunks.
  return prisma.$queryRawUnsafe<unknown[]>(
    `SELECT * FROM "${table}" ORDER BY 1 LIMIT ${ROWS_PER_CHUNK} OFFSET ${offset}`,
  );
}

/** Recursively lists files under the uploads root, as archive-relative paths. */
async function listUploads(dir: string, base: string = UPLOADS_ROOT): Promise<string[]> {
  let dirEntries;
  try {
    dirEntries = await readdir(dir, { withFileTypes: true });
  } catch {
    // No uploads directory yet is a legitimate state, not a failed backup.
    return [];
  }

  const files: string[] = [];
  for (const dirEntry of dirEntries) {
    const full = path.join(dir, dirEntry.name);
    if (dirEntry.isDirectory()) {
      files.push(...(await listUploads(full, base)));
    } else if (dirEntry.isFile() && dirEntry.name !== ".gitkeep") {
      files.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return files;
}

/** JSON with Dates as ISO strings and BigInt as a string, never as a crash. */
function toJsonBuffer(value: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(value, (_key, val) =>
      typeof val === "bigint" ? val.toString() : val,
    ),
    "utf8",
  );
}

export async function createBackup(): Promise<BackupResult> {
  const startedAt = new Date();

  await assertTableListIsComplete();
  await mkdir(BACKUPS_ROOT, { recursive: true });

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const fileName = `menuland-backup-${stamp}.tar.gz`;
  const filePath = path.join(BACKUPS_ROOT, fileName);

  const tableCounts: Record<string, number> = {};
  for (const table of TABLE_ORDER) tableCounts[table] = await countRows(table);

  const uploads = await listUploads(UPLOADS_ROOT);
  let uploadBytes = 0;

  async function* entries(): AsyncGenerator<ArchiveEntry> {
    yield {
      name: "manifest.json",
      content: toJsonBuffer({
        product: "menuland",
        createdAt: startedAt.toISOString(),
        // Recorded so a restore can refuse a dump taken against a different
        // schema rather than failing halfway through with a column error.
        schemaMigration: await currentMigration(),
        tableOrder: TABLE_ORDER,
        excludedTables: [...EXCLUDED_TABLES],
        tableCounts,
        uploadCount: uploads.length,
        rowsPerChunk: ROWS_PER_CHUNK,
      }),
    };

    for (const table of TABLE_ORDER) {
      const total = tableCounts[table] ?? 0;

      if (total === 0) {
        yield { name: `database/${table}.json`, content: toJsonBuffer([]) };
        continue;
      }

      let chunkIndex = 0;
      for (let offset = 0; offset < total; offset += ROWS_PER_CHUNK) {
        const rows = await fetchChunk(table, offset);
        const suffix =
          total > ROWS_PER_CHUNK ? `.${String(chunkIndex).padStart(3, "0")}` : "";
        yield {
          name: `database/${table}${suffix}.json`,
          content: toJsonBuffer(rows),
        };
        chunkIndex += 1;
      }
    }

    for (const relative of uploads) {
      const full = path.join(UPLOADS_ROOT, ...relative.split("/"));
      try {
        const content = await readFile(full);
        uploadBytes += content.length;
        yield { name: `uploads/${relative}`, content };
      } catch {
        // A file that vanished mid-run (deleted between listing and reading)
        // must not abort a backup that is otherwise complete.
        continue;
      }
    }
  }

  await writeTarGz(filePath, entries());

  const { size } = await stat(filePath);

  return {
    filePath,
    fileName,
    bytes: size,
    tableCounts,
    uploadCount: uploads.length,
    uploadBytes,
    startedAt,
    finishedAt: new Date(),
  };
}

async function currentMigration(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1
    `;
    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}
