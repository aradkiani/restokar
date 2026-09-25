import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The invariants of exact pricing, held against the source text.
 *
 * `Product.price` is derived from `Product.priceExact` and never the other way
 * round. A write that set `price` alone would compile, pass every unit test,
 * and quietly desynchronise the two: the menu would show one figure while the
 * next ingredient increase or bulk change computed from another. No behaviour
 * test can see a write that should not exist, so — like the `*-isolation`
 * tests — this reads the source.
 */

const src = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(path, "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (entry === "generated" || entry === "node_modules") continue;
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Every call matching `pattern`, brace-matched to its closing parenthesis, as
 * `analytics-isolation.test.ts` does — a regex that stops at a fixed indent
 * silently skips calls nested in a transaction or a loop, and a guard that
 * cannot fail is worse than none because it is believed.
 */
function calls(source: string, pattern: RegExp): string[] {
  const found: string[] = [];

  for (const match of source.matchAll(pattern)) {
    const open = match.index! + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      const char = source[i];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          found.push(source.slice(match.index!, i + 1));
          break;
        }
      }
    }
  }
  return found;
}

const productWrites = (source: string) =>
  calls(source, /\b(?:prisma|tx)\.product\.(?:create|update|upsert)\(/g);

/** A `price:` key that is the shown price itself, not `priceExact` or `compareAtPrice`. */
const WRITES_SHOWN_PRICE = /(?<![\w.])price\s*:/;

/**
 * The two legitimate ways to write a shown price: beside the exact price it
 * came from, or as the output of `shownPrices` re-deriving it from the exact
 * price already stored — which is what a change of step does.
 */
const DERIVED_FROM_EXACT =
  /\bpriceExact\b|\.\.\.\s*(?:priceData|shown)\b|\bprice\s*:\s*shown\.price\b/;

describe("exact pricing integrity", () => {
  const files = sourceFiles(src);

  it("finds the product writes it is meant to be checking", () => {
    const writers = files.filter((file) => productWrites(read(file)).length > 0);
    // The known writers: create, edit, bulk, and the costing layer. If this
    // drops to zero the scan is broken, not the codebase clean.
    expect(writers.length).toBeGreaterThanOrEqual(4);
  });

  it("never writes a shown price that is not derived from an exact one", () => {
    const offenders: string[] = [];

    for (const file of files) {
      for (const call of productWrites(read(file))) {
        if (WRITES_SHOWN_PRICE.test(call) && !DERIVED_FROM_EXACT.test(call)) {
          offenders.push(`${file}: ${call.slice(0, 120).replace(/\s+/g, " ")}`);
        }
      }
    }

    expect(offenders, "a product write sets `price` without deriving it").toEqual([]);
  });

  /**
   * One rounding rule. A route that rounded a price to a step its own way
   * would show a figure the bulk tool, the editor and the step change do not
   * agree with.
   */
  it("rounds prices to a step only in costing.ts", () => {
    for (const file of files) {
      if (file.endsWith("costing.ts")) continue;
      const source = read(file);
      expect(
        // A property path is allowed before the name — `venue.menuPriceStep` —
        // because that is how real code reads it, and an earlier version of
        // this pattern missed exactly that form when it was tested by sabotage.
        /Math\.round\([^)]*\/\s*(?:[\w.]+\.)?(?:step|roundTo|menuPriceStep)\b/.test(
          source,
        ),
        `${file} rounds a price to a step itself`,
      ).toBe(false);
    }
  });
});

describe("costing stays inside the tenant", () => {
  /**
   * Repricing rewrites menu prices from an ingredient id that arrived in a
   * request. Every query here must carry the session's tenant, or an id from
   * another venue could move that venue's menu.
   */
  it("scopes every product and recipe query in costing-server.ts", () => {
    const source = read(`${src}lib/costing-server.ts`);
    const queries = calls(source, /\btx\.(?:product|productIngredient)\.findMany\(/g);

    expect(queries.length).toBeGreaterThanOrEqual(5);
    for (const query of queries) {
      expect(query, query.slice(0, 80)).toMatch(/restaurantId/);
    }
  });
});
