import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * One venue can never read another's numbers.
 *
 * Asserted against the source text, the same way `customers-isolation.test.ts`
 * and the campaign suite's delivery guard are. The risk is not that a scoped
 * query returns the wrong rows — it is that an *unscoped* one exists at all,
 * which no unit test can see and which an integration test only catches on the
 * paths it happens to exercise.
 *
 * This matters more here than almost anywhere: analytics reads revenue, cost
 * and margin, and a missing `where` would hand one restaurant a competitor's
 * P&L.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (path: string) => readFileSync(path, "utf8");

/**
 * Every Prisma call in a file, with its full argument list.
 *
 * Brace-matched rather than pattern-matched, and that is not fussiness: the
 * first version of this test used a regex ending in `\n  })`, which only
 * matched calls closing at two-space indentation. Every query nested inside a
 * `Promise.all([...])` — which is most of them in this module — was silently
 * skipped, and the test passed happily with the tenant filter deleted from
 * `getTodayStats`. A guard that cannot fail is worse than no guard, because it
 * is believed.
 */
function prismaCalls(source: string): string[] {
  const calls: string[] = [];
  const pattern =
    /prisma\.\w+\.(findMany|findFirst|findUnique|aggregate|count|groupBy)\(/g;

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

describe("analytics tenant isolation", () => {
  /**
   * Every exported reporting function takes the tenant as its first argument.
   *
   * The convention the whole module rests on — there is deliberately no
   * "current restaurant" ambient anywhere in it, so a caller cannot forget to
   * say which venue it means.
   */
  it("takes restaurantId as the first parameter of every report", () => {
    const source = read(`${here}analytics.ts`);

    const exported = source.match(/export async function \w+\([\s\S]*?\)/g) ?? [];
    expect(exported.length).toBeGreaterThan(5);

    for (const signature of exported) {
      expect(signature, `unscoped report:\n${signature}`).toMatch(
        /\(\s*restaurantId: string/,
      );
    }
  });

  /**
   * And every Prisma call inside it filters on that argument.
   *
   * Checked per statement: a module that scopes six queries and forgets the
   * seventh would pass any whole-file check.
   */
  it("scopes every analytics query to a restaurant", () => {
    const calls = prismaCalls(read(`${here}analytics.ts`));

    // Guards the guard: if the extractor stops finding calls, this fails loudly
    // rather than passing on an empty list.
    expect(calls.length).toBeGreaterThanOrEqual(6);

    for (const call of calls) {
      expect(call, `unscoped analytics query:\n${call}`).toMatch(/restaurantId/);
    }
  });

  /** The same check over the module that composes those reports. */
  it("scopes every query in the insight server", () => {
    const calls = prismaCalls(read(`${here}sales-insights-server.ts`));

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      expect(call, `unscoped insight query:\n${call}`).toMatch(
        /restaurantId|where: \{ id/,
      );
    }
  });

  /**
   * The insight server must not become a way around that.
   *
   * It is the one place that composes many reports, so it is where an
   * unfiltered read would be easiest to introduce and hardest to notice.
   */
  it("never reads a tenant id from anywhere but its own argument", () => {
    const source = read(`${here}sales-insights-server.ts`);

    expect(source).not.toMatch(/searchParams\.get\(\s*["'`]restaurantId/);
    expect(source).not.toMatch(/body\.restaurantId/);
    expect(source).not.toMatch(/input\.restaurantId/);
  });

  /**
   * The profitability rules stay pure.
   *
   * If `profitability.ts` ever imported Prisma it could read order lines on its
   * own, outside every scope asserted above — and it is imported by client code
   * through the dashboard, so a database import would also break the bundle.
   */
  it("keeps the profitability rules free of database access", () => {
    const source = read(`${here}profitability.ts`);

    expect(source).not.toMatch(/from "\.\/prisma"/);
    expect(source).not.toMatch(/@\/generated\/prisma/);
    expect(source).not.toMatch(/server-only/);
  });

  /**
   * Analytics observes; it never writes.
   *
   * A reporting layer that can mutate is a reporting layer that can silently
   * rewrite history — and the figures it reads are the venue's accounting
   * record.
   */
  it("never mutates anything", () => {
    for (const file of ["analytics.ts", "sales-insights-server.ts", "profitability.ts"]) {
      const source = read(`${here}${file}`);

      for (const mutation of [
        /prisma\.\w+\.create/,
        /prisma\.\w+\.update/,
        /prisma\.\w+\.upsert/,
        /prisma\.\w+\.delete/,
        /\$executeRaw/,
      ]) {
        expect(source, `${file} must not write`).not.toMatch(mutation);
      }
    }
  });
});
