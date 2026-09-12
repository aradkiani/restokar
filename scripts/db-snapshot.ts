/**
 * JSON snapshot / restore for the local development database.
 *
 * The portable PostgreSQL build used on Windows ships without `pg_dump`, so
 * this reads every table through the `pg` driver instead. It is a development
 * safety net before a migration — not a production backup strategy, which
 * should use `pg_dump` against a real server.
 *
 *   npx tsx scripts/db-snapshot.ts save [label]
 *   npx tsx scripts/db-snapshot.ts list
 *   npx tsx scripts/db-snapshot.ts restore <file>
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

// tsx does not read .env on its own; Node 22 can. Matches prisma.config.ts.
try {
  process.loadEnvFile(".env");
} catch {
  // Fine when the environment is already populated (CI, Docker).
}

/**
 * Snapshots are database dumps — customer data, not code — so they live under
 * DATA_DIR alongside uploads and backups rather than in the application tree.
 * They used to sit in `./.snapshots`, which put 200MB of real customer rows
 * inside the folder a redeploy replaces.
 */
const SNAPSHOT_DIR = resolve(
  process.cwd(),
  process.env.DATA_DIR ?? "../data",
  "snapshots",
);

/**
 * Insertion order matters: a child row cannot be written before the parent it
 * references. Restore walks this list forwards and truncates in reverse.
 */
const TABLES = [
  "Plan",
  "User",
  "Restaurant",
  "Session",
  "Subscription",
  "Category",
  "Product",
  "ProductInfoSection",
  "RestaurantTable",
  "Order",
  "OrderItem",
  "OrderEvent",
  "Expense",
  "Payment",
] as const;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Run with `npx tsx` from the project root.");
  }
  return url;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function save(label: string | undefined): Promise<void> {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const data = await withClient(async (client) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const result = await client.query(`SELECT * FROM "${table}"`);
      out[table] = result.rows;
      console.log(`  ${table.padEnd(20)} ${result.rowCount} rows`);
    }
    return out;
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}${label ? `-${label}` : ""}.json`;
  const file = join(SNAPSHOT_DIR, name);

  writeFileSync(
    file,
    JSON.stringify({ takenAt: new Date().toISOString(), data }, null, 2),
  );
  console.log(`\nSnapshot written: ${join(SNAPSHOT_DIR, name)}`);
}

function list(): void {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No snapshots yet.");
    return;
  }
  for (const file of files.sort()) console.log(`  ${file}`);
}

async function restore(fileName: string): Promise<void> {
  const file = fileName.includes("/") ? fileName : join(SNAPSHOT_DIR, fileName);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    takenAt: string;
    data: Record<string, Record<string, unknown>[]>;
  };

  console.log(`Restoring snapshot from ${parsed.takenAt}\n`);

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      // Reverse order clears children before parents.
      for (const table of [...TABLES].reverse()) {
        await client.query(`DELETE FROM "${table}"`);
      }

      for (const table of TABLES) {
        const rows = parsed.data[table] ?? [];
        for (const row of rows) {
          const columns = Object.keys(row);
          if (columns.length === 0) continue;
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const quoted = columns.map((c) => `"${c}"`).join(", ");
          await client.query(
            `INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`,
            columns.map((c) => row[c]),
          );
        }
        console.log(`  ${table.padEnd(20)} ${rows.length} rows`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  console.log("\nRestore complete.");
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);

  switch (command) {
    case "save":
      await save(argument);
      break;
    case "list":
      list();
      break;
    case "restore":
      if (!argument) throw new Error("Usage: db-snapshot.ts restore <file>");
      await restore(argument);
      break;
    default:
      console.log("Usage: db-snapshot.ts save [label] | list | restore <file>");
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
