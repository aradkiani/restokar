import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A guest must never be shown a 500 because the venue's order counter drifted.
 *
 * `Order.orderNumber` is unique per tenant and is issued from
 * `Restaurant.orderSequence`. The counter only advances inside `createOrder`, so
 * anything that writes orders around it — a restore from a partial backup, a
 * data import, a script backfilling history — leaves the counter *below* the
 * numbers already on disk. Every checkout then collides with the unique
 * constraint and fails, on the one screen in the product that must not.
 *
 * That is not hypothetical. It was found on the development database, where two
 * earlier test-data scripts had inserted 268 orders directly: every new order at
 * that venue returned a 500 until the counter would have caught up. To the
 * restaurant it would simply have read as "the QR menu is broken".
 *
 * Asserted against the source text rather than by unit test, in the same spirit
 * as `analytics-isolation.test.ts` and `customers-isolation.test.ts`: the risk
 * is that the reconciliation is *deleted*, and no pure test can see that
 * because the whole mechanism lives in a database transaction.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(`${here}orders.ts`, "utf8");

/** The `prisma.$transaction(...)` body that issues an order number. */
function orderTransaction(): string {
  const start = source.indexOf("prisma.$transaction");
  expect(start, "createOrder no longer opens a transaction").toBeGreaterThan(-1);

  const end = source.indexOf("\n  });", start);
  return source.slice(start, end > start ? end : source.length);
}

describe("order number issuing", () => {
  /**
   * The counter advances atomically.
   *
   * A read followed by a write would hand two guests ordering in the same
   * instant the same number. The UPDATE also takes a row lock held to commit,
   * which is what serialises concurrent checkouts at one venue.
   */
  it("advances the sequence with an atomic increment", () => {
    expect(orderTransaction()).toMatch(/orderSequence:\s*\{\s*increment:\s*1\s*\}/);
  });

  /**
   * And it reconciles with what is already stored.
   *
   * Without this, a counter that has fallen behind produces a unique-constraint
   * violation on every subsequent order rather than correcting itself.
   */
  it("looks for order numbers at or above the issued one", () => {
    const tx = orderTransaction();

    expect(
      tx,
      "the drift check is gone — a stale counter will 500 every checkout",
    ).toMatch(/orderNumber:\s*\{\s*gte:/);
    expect(tx).toMatch(/orderBy:\s*\{\s*orderNumber:\s*"desc"\s*\}/);
  });

  /** And writes the corrected value back, so the next order does not repeat it. */
  it("persists the correction rather than only using it once", () => {
    const tx = orderTransaction();

    expect(tx).toMatch(/data:\s*\{\s*orderSequence:\s*orderNumber\s*\}/);
  });

  /**
   * The order is created with the reconciled number, not the raw counter.
   *
   * The whole guard is worthless if the create still writes `orderSequence`.
   */
  it("creates the order with the reconciled number", () => {
    const tx = orderTransaction();

    expect(tx).toMatch(/orderNumber,/);
    expect(tx, "the create still uses the unreconciled counter").not.toMatch(
      /orderNumber:\s*orderSequence/,
    );
  });
});
