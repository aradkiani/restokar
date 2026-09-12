/**
 * Restores a backup produced by `npm run backup`.
 *
 *   npx tsx scripts/backup-restore.ts data/backups/menuland-backup-….tar.gz --yes
 *   npx tsx scripts/backup-restore.ts <archive>            (dry run: reports only)
 *
 * DESTRUCTIVE. Every table listed in the archive's manifest is emptied and
 * refilled. Without `--yes` the script only reads the archive and prints what it
 * would do, because the one thing worse than a missing backup is a restore
 * nobody meant to run.
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
    console.error("Usage: tsx scripts/backup-restore.ts <archive.tar.gz> [--yes]");
    return 1;
  }

  const entries = readTar(gunzipSync(readFileSync(path.resolve(archivePath))));
  const byName = new Map(entries.map((e) => [e.name, e.content]));

  const manifestRaw = byName.get("manifest.json");
  if (!manifestRaw) {
    console.error("No manifest.json in the archive — is this a Menuland backup?");
    return 1;
  }

  const manifest = JSON.parse(manifestRaw.toString("utf8")) as Manifest;
  if (manifest.product !== "menuland") {
    console.error(`Archive is for "${manifest.product}", not menuland.`);
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

  await prisma.$transaction(async (tx) => {
    // Emptied in reverse dependency order, then filled forwards. CASCADE covers
    // the excluded tables (Session, RateLimit) that reference restored rows.
    for (const table of [...manifest.tableOrder].reverse()) {
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${quoteIdent(table)} RESTART IDENTITY CASCADE`,
      );
    }

    for (const table of manifest.tableOrder) {
      const chunks = entries
        .filter((e) => new RegExp(`^database/${table}(\\.\\d+)?\\.json$`).test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      let restored = 0;
      for (const chunk of chunks) {
        const rows = JSON.parse(chunk.content.toString("utf8")) as Record<
          string,
          unknown
        >[];
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]!);
        const columnList = columns.map(quoteIdent).join(", ");

        for (const row of rows) {
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const values = columns.map((column) => normalise(row[column]));
          await tx.$executeRawUnsafe(
            `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${placeholders})`,
            ...values,
          );
          restored += 1;
        }
      }
      console.log(`  ${table.padEnd(24)} ${restored}`);
    }
  });

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
 * Objects and arrays are re-serialised for json/jsonb columns.
 */
function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
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
