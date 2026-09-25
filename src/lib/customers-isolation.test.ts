import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The hard safety property of the customer book: one venue can never read
 * another's guests.
 *
 * Asserted against the source text, in the same spirit as the campaign
 * suite's delivery guard. The reasoning is the same: the risk is not that a
 * scoped query returns the wrong rows — it is that an *unscoped* query exists
 * at all. A unit test cannot see that, and an integration test only catches the
 * paths it happens to exercise.
 *
 * This is the most personal data the platform holds — guests' phone numbers —
 * and it is the one module where a missing `where` clause is a disclosure
 * rather than a bug.
 */

const here = fileURLToPath(new URL(".", import.meta.url));

const CUSTOMER_SOURCES = [
  `${here}customers-server.ts`,
  `${here}../app/api/customers/route.ts`,
  `${here}../app/api/customers/[id]/route.ts`,
];

const read = (path: string) => readFileSync(path, "utf8");

describe("customer tenant isolation", () => {
  /**
   * Every Prisma customer query must be scoped to a restaurant.
   *
   * Checked per statement rather than per file: one that scopes nine queries
   * and forgets the tenth would pass any whole-file check.
   *
   * Two accepted forms, because the module legitimately uses both — a literal
   * `restaurantId` in the call, or the pre-built `where` object that the
   * companion assertion below proves is itself scoped. Accepting only the
   * literal would fail `listCustomers`, which is correct code.
   */
  it("scopes every customer query to a restaurant", () => {
    const source = read(`${here}customers-server.ts`);

    // Each `prisma.customer.<op>({ … })` call, with its argument object.
    const calls = source.match(/prisma\.customer\.\w+\(\{[\s\S]*?\n {2}\}\)/g) ?? [];

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      expect(call, `unscoped customer query:\n${call}`).toMatch(/restaurantId|where,/);
    }
  });

  /**
   * …and the `where` object those queries share is built from the tenant.
   *
   * The other half of the assertion above: together they close the loop, so
   * neither can pass while the module is actually reading another venue's book.
   */
  it("builds the shared filter from the tenant", () => {
    const source = read(`${here}customers-server.ts`);

    const filters =
      source.match(/const where: Prisma\.CustomerWhereInput = \{[\s\S]*?\n {2}\};/g) ??
      [];

    expect(filters.length).toBeGreaterThan(0);

    for (const filter of filters) {
      expect(filter).toMatch(/^\s*restaurantId,\s*$/m);
    }
  });

  /**
   * The aggregate reads orders, which are the figures behind every segment.
   *
   * It joins through `Customer` and filters on that table's `restaurantId`
   * rather than the order's, so a guessed customer id from another venue
   * aggregates to nothing instead of to somebody else's sales.
   */
  it("scopes the order aggregate through the customer's own tenant", () => {
    const source = read(`${here}customers-server.ts`);

    expect(source).toMatch(/JOIN "Customer" c ON c\."id" = o\."customerId"/);
    expect(source).toMatch(/c\."restaurantId" = \$\{restaurantId\}/);
  });

  /**
   * No route may take a tenant from the request.
   *
   * The whole isolation model rests on `restaurantId` coming from the session,
   * and the single most likely way to break it is a well-meaning
   * `searchParams.get("restaurantId")`.
   */
  it("never reads a tenant id from the request", () => {
    for (const path of CUSTOMER_SOURCES) {
      const source = read(path);

      expect(source).not.toMatch(/searchParams\.get\(\s*["'`]restaurantId/);
      expect(source).not.toMatch(/params\.restaurantId/);
      expect(source).not.toMatch(/body\.restaurantId/);
      expect(source).not.toMatch(/input\.restaurantId/);
    }
  });

  /** Both customer routes are owner-only — this data is not a staff grant. */
  it("keeps both customer routes behind requireOwner", () => {
    for (const path of CUSTOMER_SOURCES.slice(1)) {
      expect(read(path)).toMatch(/requireOwner\(\)/);
    }
  });

  /**
   * The consent write is the only mutation here, and it must be scoped by
   * tenant as well as by id — `updateMany` with both, never `update` by id
   * alone, which would happily write another venue's row.
   */
  it("scopes the only customer write to the tenant", () => {
    const source = read(`${here}customers-server.ts`);

    expect(source).toMatch(
      /prisma\.customer\.updateMany\(\{[\s\S]*?where: \{ id: customerId, restaurantId \}/,
    );
    expect(source).not.toMatch(/prisma\.customer\.update\(\{\s*where: \{ id/);
  });

  /**
   * The retention layer must not become a way around any of the above.
   *
   * `retention.ts` is pure arithmetic over figures it is handed. If it ever
   * imported Prisma it would be able to read customers on its own, outside
   * every scope asserted here.
   */
  it("keeps the retention rules free of database access", () => {
    const source = read(`${here}retention.ts`);

    expect(source).not.toMatch(/from "\.\/prisma"/);
    expect(source).not.toMatch(/@\/generated\/prisma/);
    expect(source).not.toMatch(/server-only/);
  });
});
