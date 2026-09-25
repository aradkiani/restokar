import { roundCompareAt, roundMenuPrice, tidyExact } from "./costing";

/**
 * Raising every price on a menu at once.
 *
 * The operation a venue actually performs when costs move: "put everything up
 * ten percent". Done by hand it is a hundred edits, each one a chance to fat-
 * finger a digit.
 *
 * **The percentage applies to the exact price, and rounding happens after.**
 * This tool used to round each result and save the rounded figure as the
 * price, so the next increase started from a number that was never the real
 * price: 250,000 up 10% is 275,000, shown as 280,000 at a 10,000 step, and the
 * next 10% then compounded on 280,000 — 308,000, shown as 310,000 — where the
 * exact arithmetic says 302,500, shown as 300,000. A few rounds of that and a
 * menu has drifted a step or two above where its own increases put it. Now the
 * exact price moves, and the shown price is derived from it with the venue's
 * one step (`Restaurant.menuPriceStep`) — see `roundMenuPrice` in `costing.ts`.
 *
 * Pure and dependency-free apart from those rules, so the same function
 * computes the preview the owner approves and the values the server writes. A
 * preview produced by different code from the write is a preview of something
 * else.
 */

/** Steps offered for the venue's menu price step. 0 means "don't round". */
export const PRICE_ROUNDING_STEPS = [0, 500, 1_000, 5_000, 10_000, 50_000] as const;

/** Bounds on a single bulk change. */
export const MIN_BULK_PERCENT = -50;
export const MAX_BULK_PERCENT = 100;

export interface BulkPriceInput {
  /** Signed percentage, e.g. 10 for +10%. */
  percent: number;
  /** The venue's menu price step. 0 shows exact prices to the nearest Toman. */
  step: number;
}

/**
 * An exact price moved by a percentage, unrounded.
 *
 * A free item stays free: ten percent of nothing is nothing, and a venue that
 * gives something away has not priced it.
 */
export function adjustExact(exact: number, percent: number): number {
  if (!(exact > 0)) return exact;
  return Math.max(0, tidyExact(exact * (1 + percent / 100)));
}

export interface PricedItem {
  id: string;
  name: string;
  /** Shown price. */
  price: number;
  /** Exact price, the one the percentage applies to. */
  priceExact: number;
  /** The struck-through "was" price, when the item is on offer. */
  compareAtPrice?: number | null;
  compareAtPriceExact?: number | null;
}

export interface AdjustedItem extends PricedItem {
  nextPriceExact: number;
  nextPrice: number;
  nextCompareAtPriceExact: number | null;
  nextCompareAtPrice: number | null;
  changed: boolean;
}

/**
 * Applies the change to a list, flagging which rows actually move.
 *
 * The "was" price moves by the same percentage as the price, from its own exact
 * figure. A discount is a *relationship* between two numbers, and raising only
 * one of them quietly rewrites the offer a guest is shown.
 */
export function adjustAll(items: PricedItem[], input: BulkPriceInput): AdjustedItem[] {
  return items.map((item) => {
    const compareExact = item.compareAtPriceExact ?? item.compareAtPrice ?? null;

    const nextPriceExact = adjustExact(item.priceExact, input.percent);
    const nextPrice = roundMenuPrice(nextPriceExact, input.step);

    const nextCompareAtPriceExact =
      compareExact === null ? null : adjustExact(compareExact, input.percent);
    const nextCompareAtPrice = roundCompareAt(
      nextCompareAtPriceExact,
      nextPriceExact,
      nextPrice,
      input.step,
    );

    return {
      ...item,
      compareAtPrice: item.compareAtPrice ?? null,
      compareAtPriceExact: compareExact,
      nextPriceExact,
      nextPrice,
      nextCompareAtPriceExact,
      nextCompareAtPrice,
      // A row counts as changed if any stored figure moves — including an exact
      // price whose shown price happens to stay on the same step.
      changed:
        nextPriceExact !== item.priceExact ||
        nextPrice !== item.price ||
        nextCompareAtPriceExact !== compareExact ||
        nextCompareAtPrice !== (item.compareAtPrice ?? null),
    };
  });
}

export interface BulkPriceSummary {
  total: number;
  changed: number;
  /** Sum of shown prices before and after, so an owner can check the direction. */
  before: number;
  after: number;
}

export function summarise(adjusted: AdjustedItem[]): BulkPriceSummary {
  return {
    total: adjusted.length,
    changed: adjusted.filter((item) => item.changed).length,
    before: adjusted.reduce((sum, item) => sum + item.price, 0),
    after: adjusted.reduce((sum, item) => sum + item.nextPrice, 0),
  };
}
