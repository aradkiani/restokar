/**
 * Raising every price on a menu at once.
 *
 * The operation a venue actually performs when costs move: "put everything up
 * ten percent". Done by hand it is a hundred edits, each one a chance to fat-
 * finger a digit, and the prices come out looking like arithmetic — 275,500 —
 * rather than like prices.
 *
 * So the percentage and the rounding are one operation. Rounding afterwards by
 * hand would defeat the point, and rounding *before* applying the percentage
 * gives a different, wrong answer.
 *
 * Pure and dependency-free, so the same function computes the preview the owner
 * approves and the values the server writes. A preview produced by different
 * code from the write is a preview of something else.
 */

/** Steps offered in the UI. 0 means "don't round". */
export const PRICE_ROUNDING_STEPS = [0, 500, 1_000, 5_000, 10_000, 50_000] as const;

/** Bounds on a single bulk change. */
export const MIN_BULK_PERCENT = -50;
export const MAX_BULK_PERCENT = 100;

export interface BulkPriceInput {
  /** Signed percentage, e.g. 10 for +10%. */
  percent: number;
  /** Round the result to a multiple of this. 0 disables rounding. */
  roundTo: number;
}

/**
 * The new price for one item.
 *
 * Rounds to the *nearest* step, which is what makes the worked example behave:
 * 250,000 raised by 10% is 275,000, and the nearest 10,000 is 280,000.
 *
 * Two guards that matter more than they look:
 *
 *   * A free item stays free. Ten percent of nothing is nothing, and rounding
 *     that up to the step would put a price on something the venue deliberately
 *     gives away.
 *   * A priced item never rounds down to zero. A 300-Toman item rounded to the
 *     nearest 10,000 is 0, which would silently turn a cheap side dish into a
 *     free one. Below half a step the item keeps its computed price instead.
 */
export function adjustPrice(price: number, { percent, roundTo }: BulkPriceInput): number {
  if (price <= 0) return price;

  const raised = Math.round(price * (1 + percent / 100));
  if (raised <= 0) return 0;

  if (roundTo <= 0) return raised;

  const rounded = Math.round(raised / roundTo) * roundTo;
  return rounded <= 0 ? raised : rounded;
}

/**
 * The "was" price on a discounted item, raised alongside the price itself.
 *
 * A discount is a *relationship* between two numbers, and raising only one of
 * them quietly rewrites it. A dish at 200,000 marked down from 250,000 is a 20%
 * saving; put the price up 20% and leave the other figure alone and the guest
 * is shown 240,000 "down from 250,000" — a 4% saving the venue never agreed to,
 * on a strike-through that now looks like a mistake.
 *
 * The ordering guard matters more than it looks. Both numbers round to the same
 * step, so a small discount can collapse: at a 10,000 step, 98,000 → 120,000 and
 * a "was" of 100,000 → 120,000 too, and the discount disappears entirely. Rather
 * than let that happen the "was" price falls back to its unrounded raise, and
 * failing that keeps its original distance above the price. A slightly untidy
 * number is a much smaller problem than a discount that silently evaporates
 * across a whole menu.
 */
export function adjustCompareAt(
  compareAtPrice: number | null,
  price: number,
  nextPrice: number,
  input: BulkPriceInput,
): number | null {
  if (compareAtPrice === null || compareAtPrice <= 0) return compareAtPrice;

  const raised = adjustPrice(compareAtPrice, input);

  // Only defend the ordering where a discount was actually on display; a
  // "was" price at or below the price shows nothing to a guest either way.
  if (compareAtPrice <= price || raised > nextPrice) return raised;

  const unrounded = adjustPrice(compareAtPrice, { percent: input.percent, roundTo: 0 });
  if (unrounded > nextPrice) return unrounded;

  // Last resort: preserve the original gap, which is always above the price.
  return nextPrice + (compareAtPrice - price);
}

export interface PricedItem {
  id: string;
  name: string;
  price: number;
  /** The struck-through "was" price, when the item is on offer. */
  compareAtPrice?: number | null;
}

export interface AdjustedItem extends PricedItem {
  nextPrice: number;
  nextCompareAtPrice: number | null;
  changed: boolean;
}

/** Applies the change to a list, flagging which rows actually move. */
export function adjustAll(items: PricedItem[], input: BulkPriceInput): AdjustedItem[] {
  return items.map((item) => {
    const compareAtPrice = item.compareAtPrice ?? null;
    const nextPrice = adjustPrice(item.price, input);
    const nextCompareAtPrice = adjustCompareAt(
      compareAtPrice,
      item.price,
      nextPrice,
      input,
    );

    return {
      ...item,
      compareAtPrice,
      nextPrice,
      nextCompareAtPrice,
      // A row counts as changed if *either* figure moves — an item whose price
      // is already on the step but whose "was" price is not still needs writing.
      changed: nextPrice !== item.price || nextCompareAtPrice !== compareAtPrice,
    };
  });
}

export interface BulkPriceSummary {
  total: number;
  changed: number;
  /** Sum before and after, so an owner can sanity-check the direction. */
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
