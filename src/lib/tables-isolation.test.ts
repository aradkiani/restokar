import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A venue can never read another venue's tables — and a guest can never read
 * any of them.
 *
 * Asserted against the source text, like `analytics-isolation.test.ts` and
 * `customers-isolation.test.ts`. The risk is not that a scoped query returns
 * the wrong rows; it is that an *unscoped* one exists at all, which no unit
 * test can see.
 *
 * Two properties matter here, and the second is specific to this feature.
 * Table intelligence reads revenue, so a missing tenant filter is a competitor's
 * takings — that is the familiar one. But the figures are also derived from a
 * column written by a **public, unauthenticated beacon**, so this file also
 * guards the boundary in the other direction: what the guest's menu may reach.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (path: string) => readFileSync(path, "utf8");

/**
 * Every Prisma call in a file, with its full argument list.
 *
 * Brace-matched, copied from `analytics-isolation.test.ts` for the reason
 * recorded there: a regex that ends at a fixed indentation silently skips every
 * query nested in a `Promise.all`, and a guard that cannot fail is worse than
 * no guard because it is believed.
 */
function prismaCalls(source: string): string[] {
  const calls: string[] = [];
  const pattern =
    /prisma\.\w+\.(findMany|findFirst|findUnique|aggregate|count|groupBy|upsert)\(/g;

  for (const match of source.matchAll(pattern)) {
    const open = match.index! + match[0].length - 1;

    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      const char = source[i];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(match.index!, i + 1));
          break;
        }
      }
    }
  }

  return calls;
}

describe("table intelligence tenant isolation", () => {
  it("takes restaurantId as the first parameter of every report", () => {
    const source = read(`${here}tables-server.ts`);

    const exported = source.match(/export async function \w+\([\s\S]*?\)/g) ?? [];
    expect(exported.length).toBeGreaterThanOrEqual(3);

    for (const signature of exported) {
      expect(signature, `unscoped table report:\n${signature}`).toMatch(
        /\(\s*restaurantId: string/,
      );
    }
  });

  it("scopes every table query to a restaurant", () => {
    const calls = prismaCalls(read(`${here}tables-server.ts`));

    // Guards the guard: an extractor that stops finding calls must fail loudly
    // rather than pass on an empty list.
    expect(calls.length).toBeGreaterThanOrEqual(2);

    for (const call of calls) {
      expect(call, `unscoped table query:\n${call}`).toMatch(/restaurantId/);
    }
  });

  /**
   * MenuDailyView is read by two modules now. Both must scope.
   *
   * `menu-views.ts` gained the per-table read, and it is the module a public
   * route writes through — so an unscoped read here would be reachable from the
   * least trusted surface the platform has.
   */
  it("scopes every menu-view query to a restaurant", () => {
    const calls = prismaCalls(read(`${here}menu-views.ts`));

    expect(calls.length).toBeGreaterThanOrEqual(3);

    for (const call of calls) {
      expect(call, `unscoped menu-view query:\n${call}`).toMatch(/restaurantId/);
    }
  });

  it("never reads a tenant id from anywhere but its own argument", () => {
    const source = read(`${here}tables-server.ts`);

    expect(source).not.toMatch(/searchParams\.get\(\s*["'`]restaurantId/);
    expect(source).not.toMatch(/body\.restaurantId/);
    expect(source).not.toMatch(/input\.restaurantId/);
  });

  /**
   * The table rules stay pure.
   *
   * If `tables.ts` imported Prisma it could read orders on its own, outside
   * every scope asserted above — and it is reached from the dashboard bundle,
   * so a database import would break the client build as well.
   */
  it("keeps the table rules free of database access", () => {
    const source = read(`${here}tables.ts`);

    expect(source).not.toMatch(/from "\.\/prisma"/);
    expect(source).not.toMatch(/@\/generated\/prisma/);
    expect(source).not.toMatch(/server-only/);
  });

  /** The report observes; it never writes. */
  it("never mutates anything", () => {
    const source = read(`${here}tables-server.ts`);

    for (const mutation of [
      /prisma\.\w+\.create/,
      /prisma\.\w+\.update/,
      /prisma\.\w+\.upsert/,
      /prisma\.\w+\.delete/,
      /\$executeRaw/,
    ]) {
      expect(source, "tables-server must not write").not.toMatch(mutation);
    }
  });
});

describe("table intelligence public/private boundary", () => {
  const publicBeacon = `${here}../app/api/public/menu-view/route.ts`;

  /**
   * The guest's beacon may count an open. It may not read what that open is
   * worth.
   *
   * This is the route the whole feature's view data comes from, and it is
   * unauthenticated by design. Importing the report here — even to "enrich" a
   * response — would put one venue's table revenue one handler away from any
   * guest with a phone.
   */
  it("keeps the public menu-view route away from the table report", () => {
    const source = read(publicBeacon);

    expect(source).not.toMatch(/tables-server/);
    expect(source).not.toMatch(/from "@\/lib\/analytics"/);
    expect(source).not.toMatch(/getTableReport/);
  });

  /**
   * And it resolves the venue itself rather than being told which one.
   *
   * The body carries a slug and a table number; the restaurant id is looked up
   * from the slug. A route that accepted an id would let a caller write view
   * counts onto any venue on the platform.
   */
  it("never accepts a restaurant id from the guest", () => {
    const source = read(publicBeacon);

    expect(source).not.toMatch(/restaurantId:\s*z\./);
    expect(source).not.toMatch(/input\.restaurantId/);
  });

  /**
   * The table number a guest's link supplies is counted, never trusted.
   *
   * It reaches a column the report groups by, so it is bounded and normalised
   * before storage — the same 20-character bound `CreateOrderInput` puts on the
   * column it is joined against, so the two cannot drift apart and stop
   * matching.
   */
  it("bounds and normalises the table number the beacon accepts", () => {
    expect(read(publicBeacon)).toMatch(/z\.string\(\)\.trim\(\)\.max\(20\)/);
    expect(read(`${here}menu-views.ts`)).toMatch(/export function normaliseViewTable/);
  });

  /**
   * The dashboard page is behind the analytics grant.
   *
   * Table revenue is financial, so it sits with the other financial reports
   * rather than with the QR printing screen: a staff account granted `qr` to
   * print codes must not thereby learn what each table takes.
   */
  it("guards the table report page with the analytics tab", () => {
    const source = read(`${here}../app/dashboard/analytics/tables/page.tsx`);

    expect(source).toMatch(/requirePageTab\(\s*["']analytics["']/);
  });
});
