import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every report reads orders by the business date they were filed under.
 *
 * Asserted against the source: a report that went back to `placedAt` ranges
 * would quietly move every after-midnight order of a late café into the next
 * day, and the totals would still look plausible.
 */

const src = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) =>
  readFileSync(`${src}${path}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const REPORTS = [
  "lib/analytics.ts",
  "lib/chain.ts",
  "lib/tables-server.ts",
  "lib/dashboard-insights.ts",
  "lib/sales-insights-server.ts",
  "lib/cash-close-server.ts",
  "lib/export/datasets.ts",
];

describe("reports group by business day", () => {
  it.each(REPORTS)("%s never selects orders by a placedAt range", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/placedAt:\s*\{\s*gte/);
    expect(source).not.toMatch(/"placedAt" >=/);
  });

  it("files every new order under a business date", () => {
    const orders = read("lib/orders.ts");
    expect(orders).toMatch(/businessDate: dbDate\(businessDateKey\(placedAt, hours\)\)/);
  });

  it("anchors rolling windows on the site's business today", () => {
    const analytics = read("lib/analytics.ts");
    expect(analytics).not.toMatch(/= resolveRange\(window\)/);
    expect(analytics).toMatch(/siteRange\(restaurantId, window\)/);
  });
});
