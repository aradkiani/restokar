import { convert, isUnitCode } from "./units";

/**
 * What a dish costs in ingredients, and how its price follows that cost.
 *
 * Four rules, each a function below:
 *
 *   1. **An ingredient's unit cost** comes from what the venue pays for it, in
 *      whatever unit the invoice uses — 45,000 a kilogram, 330,000 a gram.
 *   2. **A dish's cost** is its recipe priced at those unit costs. Ingredients
 *      only: no labour, no rent, no profit. That is the figure the owner asked
 *      for, and the one a price must at the very least cover.
 *   3. **When an ingredient's price moves, each dish using it moves by exactly
 *      the change in its own ingredient cost.** Flour up 10% on a dish using
 *      230 g of it raises that dish's cost by 10% of 230 g of flour — say 1,035
 *      Toman — and the dish's price by the same 1,035. The venue's margin in
 *      Toman is kept, not its margin in percent.
 *   4. **Prices are kept exact and rounded only to be shown.** Rounding inside
 *      the arithmetic means every later change compounds on a figure that was
 *      never the real price, and after a few rounds of increases the menu
 *      drifts from where the costs say it should be. The exact price is stored;
 *      the rounded one is what a guest sees and pays.
 *
 * Pure: no database and no framework, like `pricing.ts` and `inventory.ts`, so
 * every rule is tested directly.
 */

/** Thousandths: the storage resolution of stock and recipe amounts. */
const MILLI = 1_000;

// ----------------------------------------------------------- exact values

/**
 * Four decimal places, the precision an exact price is kept to.
 *
 * Far below a Toman, so it never shows; it exists to stop floating-point noise
 * (0.30000000000000004) accumulating in a stored value across many updates.
 */
export function tidyExact(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}

// ----------------------------------------------------------- ingredients

export interface PricedIngredient {
  /** The item's stock unit. */
  unit: string;
  /** Whole Toman per one `priceUnit`, or null when unpriced. */
  purchasePrice: number | null;
  priceUnit: string | null;
}

/**
 * What one of the item's *own* unit costs, exactly. Null when unpriced.
 *
 * 45,000 per kilogram, stocked in grams, is 45 per gram. Kept unrounded:
 * saffron at 330,000,000 a kilogram, stocked in milligram-scale recipe amounts,
 * is 330,000 per gram, and a rounded figure here would put an error into every
 * dish that uses it.
 */
export function unitCost(item: PricedIngredient): number | null {
  const { purchasePrice, priceUnit, unit } = item;
  if (purchasePrice === null || purchasePrice <= 0) return null;
  if (!isUnitCode(unit) || !isUnitCode(priceUnit)) return null;

  // How many priceUnits one item unit is. One gram is 0.001 kilograms.
  const share = convert(1, unit, priceUnit);
  return share === null ? null : purchasePrice * share;
}

// ------------------------------------------------------------- recipes

export interface RecipeLine {
  itemId: string;
  /** Thousandths of the item's unit consumed by one of the dish. */
  perUnitMilli: number;
}

export interface RecipeCost {
  /** Exact ingredient cost of one dish, over the priced lines. */
  cost: number;
  /** True when every line's ingredient has a price, so `cost` is the whole. */
  complete: boolean;
  /** Ingredients without a price, which `cost` leaves out. */
  unpricedItemIds: string[];
}

/** One recipe line's exact cost. Null when its ingredient is unpriced. */
export function lineCost(perUnitMilli: number, item: PricedIngredient): number | null {
  const perUnit = unitCost(item);
  return perUnit === null ? null : (perUnitMilli / MILLI) * perUnit;
}

/**
 * A dish's ingredient cost.
 *
 * An empty recipe is *not* complete: a dish with no recipe has no computed
 * cost, which is different from a cost of zero, and the owner's own figure
 * stands for it. A recipe with an unpriced ingredient is incomplete for the
 * same reason — its cost is at least `cost`, and reporting that partial sum as
 * the dish's cost would make a loss look like a margin.
 */
export function recipeCost(
  lines: readonly RecipeLine[],
  items: ReadonlyMap<string, PricedIngredient>,
): RecipeCost {
  let cost = 0;
  const unpricedItemIds: string[] = [];

  for (const line of lines) {
    const item = items.get(line.itemId);
    const value = item ? lineCost(line.perUnitMilli, item) : null;

    if (value === null) unpricedItemIds.push(line.itemId);
    else cost += value;
  }

  return {
    cost: tidyExact(cost),
    complete: lines.length > 0 && unpricedItemIds.length === 0,
    unpricedItemIds,
  };
}

// -------------------------------------------------------- pass-through

/**
 * How much one dish's cost moves when one of its ingredients is repriced.
 *
 * Computed from the line's cost before and after, rather than from the
 * percentage change, so that a unit or a price-unit changing in the same edit
 * is accounted for: flour going from "45,000 per kg" to "45 per g" is no change
 * at all, and this answers zero for it.
 *
 * A line that was unpriced before has no "before": the first price an owner
 * enters is the cost being established, not the cost rising, and moving the
 * menu for it would add the whole ingredient cost to a price that already
 * included it.
 */
export function passThroughDelta(
  perUnitMilli: number,
  before: PricedIngredient,
  after: PricedIngredient,
): number {
  const was = lineCost(perUnitMilli, before);
  const now = lineCost(perUnitMilli, after);
  if (was === null || now === null) return 0;
  return tidyExact(now - was);
}

/**
 * An exact price moved by a cost change. Never below zero.
 *
 * A free dish stays free: a venue that gives something away has not priced it,
 * and a cost increase is no reason to start charging for it.
 */
export function applyCostDelta(priceExact: number, delta: number): number {
  if (priceExact <= 0) return priceExact;
  return Math.max(0, tidyExact(priceExact + delta));
}

// ------------------------------------------------------------- rounding

/**
 * The price a guest sees and pays: the exact price at the venue's step.
 *
 * Rounds to the *nearest* step — the behaviour the bulk price tool always had —
 * and keeps its two guards:
 *
 *   - **Free stays free.** Nothing rounds a zero up into a charge.
 *   - **Priced never becomes free.** A 300-Toman item at a 10,000 step is
 *     nearer zero than 10,000, and a side dish silently turning free is worse
 *     than an untidy number, so below half a step it keeps its own whole-Toman
 *     price.
 *
 * A step of 0 means "no rounding": the exact price to the nearest Toman, which
 * is what money columns hold.
 */
export function roundMenuPrice(exact: number, step: number): number {
  const value = tidyExact(exact);
  if (!(value > 0)) return 0;

  const whole = Math.max(1, Math.round(value));
  if (!(step > 0)) return whole;

  const stepped = Math.round(value / step) * step;
  return stepped > 0 ? stepped : whole;
}

/**
 * The shown "was" price beside the shown price.
 *
 * Both are rounded to the same step, which can collapse a small discount: at a
 * 10,000 step a 98,000 dish "down from 100,000" rounds to 100,000 down from
 * 100,000. Where the exact figures showed a discount and the rounded ones no
 * longer do, the "was" price is shown unrounded instead — a slightly untidy
 * number is a much smaller problem than an offer that silently disappears.
 */
export function roundCompareAt(
  compareExact: number | null,
  priceExact: number,
  shownPrice: number,
  step: number,
): number | null {
  if (compareExact === null || !(compareExact > 0)) return null;

  const rounded = roundMenuPrice(compareExact, step);
  const wasDiscounted = compareExact > priceExact;
  if (!wasDiscounted || rounded > shownPrice) return rounded;

  const whole = Math.round(compareExact);
  if (whole > shownPrice) return whole;

  // Last resort: keep the discount's own size above the shown price.
  return shownPrice + Math.max(1, Math.round(compareExact - priceExact));
}

/**
 * Both shown prices, derived from the exact ones at the venue's step.
 *
 * The one function every write goes through — a manual edit, a bulk change, an
 * ingredient's cost moving, the step itself changing — so the shown price can
 * never be computed two ways.
 */
export function shownPrices(input: {
  priceExact: number;
  compareAtPriceExact: number | null;
  step: number;
}): { price: number; compareAtPrice: number | null } {
  const price = roundMenuPrice(input.priceExact, input.step);
  return {
    price,
    compareAtPrice: roundCompareAt(
      input.compareAtPriceExact,
      input.priceExact,
      price,
      input.step,
    ),
  };
}

// ------------------------------------------------------------- warnings

export type PriceWarning = "BELOW_COST" | "LOW_MARGIN";

export interface PriceHealth {
  warning: PriceWarning | null;
  /** (price − cost) / price, as a percentage. Null when there is no cost. */
  marginPercent: number | null;
}

/**
 * Whether a price covers its ingredients with room to spare.
 *
 * Judged on the price a guest actually pays — the rounded one — because that
 * is the money that comes in. Two warnings, in order of seriousness:
 *
 *   - **BELOW_COST**: the ingredients alone cost more than the dish sells for.
 *     Every one sold loses money before the kitchen has been paid.
 *   - **LOW_MARGIN**: it covers them, but by less than the venue's own floor.
 *     A price exactly equal to its cost lands here, at a margin of zero.
 *
 * No cost, no judgement: a dish without a known cost is neither healthy nor
 * unhealthy, and warning about it would teach the owner to ignore the warning.
 * These are warnings, never refusals — pricing a dish below cost can be a
 * deliberate choice, and it is the owner's to make.
 */
export function priceHealth(input: {
  price: number;
  cost: number;
  lowMarginPercent: number;
}): PriceHealth {
  const { price, cost, lowMarginPercent } = input;
  if (!(cost > 0)) return { warning: null, marginPercent: null };
  if (!(price > 0)) return { warning: "BELOW_COST", marginPercent: null };

  const marginPercent = Math.round(((price - cost) / price) * 1_000) / 10;

  if (price < cost) return { warning: "BELOW_COST", marginPercent };
  if (marginPercent < lowMarginPercent) return { warning: "LOW_MARGIN", marginPercent };
  return { warning: null, marginPercent };
}
