import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every route that reads or moves orders requires the `orders` section.
 *
 * Asserted against the source text, like the isolation tests. These routes used
 * to call `requireTenant()`, which checks only that the caller belongs to the
 * venue: a staff member granted nothing but the menu could list every order —
 * guest names, totals, tips — and move them through the kitchen workflow,
 * although the board page itself sent them away. The page and the API must
 * ask the same question.
 */

const api = fileURLToPath(new URL("../app/api/", import.meta.url));
const read = (path: string) => readFileSync(`${api}${path}`, "utf8");

const ORDER_ROUTES = [
  "orders/route.ts",
  "orders/[id]/route.ts",
  "orders/[id]/status/route.ts",
  "orders/[id]/payment/route.ts",
  "orders/[id]/refund/route.ts",
  "orders/manual/route.ts",
];

describe("order routes require the orders section", () => {
  for (const path of ORDER_ROUTES) {
    it(`${path} calls requireTab("orders") and never requireTenant alone`, () => {
      const source = read(path);
      expect(source).toMatch(/requireTab\("orders"\)/);
      expect(source).not.toMatch(/await requireTenant\(\)/);
    });
  }

  it("the live order stream checks the orders section", () => {
    const source = read("orders/stream/route.ts");
    expect(source).toMatch(/canAccessTab\(user, "orders"\)/);
  });
});
