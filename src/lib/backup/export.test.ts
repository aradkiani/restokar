import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the backup's table list honest against the schema.
 *
 * `export.ts` already asserts the same thing at run time, but that check only
 * fires when a backup is actually taken — on a schedule, into a log nobody
 * reads. Between 2026-09-04 and 2026-09-12 eleven tables were added by
 * migrations and never added to TABLE_ORDER; every backup in that window
 * refused to run, and the first anyone knew of it was a restore rehearsal.
 * Eight days of no backups, reported only to a log file.
 *
 * So the same invariant is asserted here, where it fails in CI the moment a
 * migration adds a model. The run-time check stays: it catches a table created
 * outside Prisma, which this cannot see.
 *
 * The source is read as text rather than imported because `export.ts` pulls in
 * `src/lib/prisma.ts`, which builds a real client from a real DATABASE_URL at
 * module load. This test needs neither a database nor a generated client.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.resolve(here, "..", "..", "..");

const schemaSource = readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8");
const exportSource = readFileSync(path.join(here, "export.ts"), "utf8");

/** Model names from the Prisma schema. No `@@map` in this schema, so model name == table name. */
function schemaModels(): string[] {
  return [...schemaSource.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
}

/** Pulls a quoted string list out of a named declaration in export.ts. */
function declaredNames(declaration: string): string[] {
  const block = exportSource.slice(exportSource.indexOf(declaration));
  const end = block.indexOf("]");
  if (!block.startsWith(declaration) || end === -1) {
    throw new Error(`Could not find ${declaration} in export.ts`);
  }
  return [...block.slice(0, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

const TABLE_ORDER = declaredNames("const TABLE_ORDER = [");
const EXCLUDED_TABLES = declaredNames("const EXCLUDED_TABLES = new Set([");

/**
 * Parent/child edges from the schema's relation fields.
 *
 * The side that declares `fields: [...]` holds the foreign key, so it is the
 * child and must be restored after the model it points at.
 */
function relationEdges(): { child: string; parent: string }[] {
  const edges: { child: string; parent: string }[] = [];

  for (const match of schemaSource.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const child = match[1]!;
    for (const field of match[2]!.matchAll(
      /^\s*\w+\s+(\w+)(?:\?|\[\])?\s+@relation\([^)]*fields:/gm,
    )) {
      const parent = field[1]!;
      if (parent !== child) edges.push({ child, parent });
    }
  }

  return edges;
}

/**
 * The one edge no flat ordering can satisfy. `scripts/backup-restore.ts`
 * writes `User.restaurantId` on a second pass instead.
 */
const TWO_PASS_EDGE = { child: "User", parent: "Restaurant" };

describe("backup table coverage", () => {
  it("parsed the declarations it is asserting against", () => {
    // Guards the regexes above: a silently-empty list would make every other
    // assertion in this file pass for the wrong reason.
    expect(TABLE_ORDER.length).toBeGreaterThan(20);
    expect(EXCLUDED_TABLES).toContain("Session");
    expect(schemaModels().length).toBeGreaterThan(20);
  });

  it("covers every model in the Prisma schema", () => {
    const covered = new Set([...TABLE_ORDER, ...EXCLUDED_TABLES]);
    const missing = schemaModels().filter((model) => !covered.has(model));

    expect(
      missing,
      `Model(s) added to schema.prisma but not to TABLE_ORDER in src/lib/backup/export.ts. ` +
        `A backup omitting them would restore an incomplete database — add them in ` +
        `dependency order (parents first), or to EXCLUDED_TABLES with a reason.`,
    ).toEqual([]);
  });

  it("lists no table that is not a model", () => {
    const models = new Set(schemaModels());
    const unknown = TABLE_ORDER.filter((table) => !models.has(table));

    expect(unknown, "TABLE_ORDER names something that is not a Prisma model").toEqual([]);
  });

  it("lists each table exactly once", () => {
    const seen = new Set<string>();
    const duplicates = TABLE_ORDER.filter((t) => !seen.add(t) || false);

    expect(duplicates, "A table restored twice would violate its primary key").toEqual(
      [],
    );
  });

  it("orders every table after the tables it references", () => {
    const position = new Map(TABLE_ORDER.map((table, i) => [table, i]));

    const violations = relationEdges()
      .filter(({ child, parent }) => {
        if (child === TWO_PASS_EDGE.child && parent === TWO_PASS_EDGE.parent)
          return false;
        const c = position.get(child);
        const p = position.get(parent);
        return c !== undefined && p !== undefined && p > c;
      })
      .map(({ child, parent }) => `${child} is restored before ${parent}`);

    expect(
      violations,
      "A child restored before its parent fails the foreign key and aborts the restore.",
    ).toEqual([]);
  });

  it("keeps User before Restaurant, which the two-pass insert depends on", () => {
    // If these ever swap, the deferred-column trick in backup-restore.ts is
    // pointed at the wrong side of the cycle and the restore breaks again.
    expect(TABLE_ORDER.indexOf("User")).toBeLessThan(TABLE_ORDER.indexOf("Restaurant"));
  });
});
