/**
 * The arithmetic of the stock ledger: average cost, valuation, counts, and
 * what reaches the profit and loss.
 *
 * Free of database imports so every rule can be tested on its own; the writer
 * is `postMovements` in stock.ts, and it calls these.
 *
 * Quantities are thousandths of the item's unit (see inventory.ts). Costs are
 * Toman per **one** item unit, kept unrounded — 45 Toman a gram is a real
 * price — and rounded to whole Toman only when a value is reported.
 */

import { unitCost as referenceUnitCost, type PricedIngredient } from "./costing";

const MILLI = 1_000;

/** Why stock was thrown away. Keys, translated by the dashboard. */
export const WASTE_REASONS = [
  "spoiled",
  "expired",
  "damaged",
  "staffMeal",
  "other",
] as const;

export type WasteReason = (typeof WASTE_REASONS)[number];

export function isWasteReason(value: unknown): value is WasteReason {
  return (
    typeof value === "string" && (WASTE_REASONS as readonly string[]).includes(value)
  );
}

/**
 * Whole Toman for an amount at a unit cost. Zero when the cost is unknown.
 *
 * Rounds half away from zero, symmetrically: `Math.round` takes -45.5 to -45
 * but 45.5 to 46, and a loss would then be valued a Toman below the same gain.
 */
export function valueOf(milli: number, unitCost: number | null | undefined): number {
  if (!unitCost || !Number.isFinite(unitCost)) return 0;
  const value = (milli / MILLI) * unitCost;
  return Math.sign(value) * Math.round(Math.abs(value)) || 0;
}

/** Toman per item unit paid on a purchase line. Null for an empty line. */
export function purchaseUnitCost(
  lineTotal: number,
  quantityMilli: number,
): number | null {
  if (quantityMilli <= 0 || lineTotal < 0) return null;
  return lineTotal / (quantityMilli / MILLI);
}

/**
 * The site's average cost after goods arrive.
 *
 *     new = (on hand × average + received × paid) ÷ (on hand + received)
 *
 * Only stock actually on hand carries the old average. When the shelf is at or
 * below zero — sold before the delivery was booked, which a kitchen does every
 * day — the old figure describes stock that no longer exists, and the
 * delivery's own price is the honest answer. Likewise when the old average was
 * never known.
 */
export function weightedAverage(
  current: { quantityMilli: number; avgCost: number | null },
  received: { quantityMilli: number; unitCost: number },
): number {
  if (received.quantityMilli <= 0) return current.avgCost ?? received.unitCost;
  if (current.quantityMilli <= 0 || current.avgCost === null) return received.unitCost;

  const onHand = current.quantityMilli;
  return (
    (onHand * current.avgCost + received.quantityMilli * received.unitCost) /
    (onHand + received.quantityMilli)
  );
}

/**
 * What one item unit costs at a site, for valuing anything other than a
 * purchase: the site's weighted average once a purchase has set it, and the
 * owner's reference price until then.
 */
export function effectiveUnitCost(
  avgCost: number | null | undefined,
  item: PricedIngredient,
): number | null {
  if (avgCost !== null && avgCost !== undefined && Number.isFinite(avgCost))
    return avgCost;
  return referenceUnitCost(item);
}

export interface CountLine {
  itemId: string;
  expectedMilli: number;
  countedMilli: number;
  unitCost: number | null;
}

/**
 * What a count found, item by item and in total.
 *
 * Shortage and surplus are kept apart rather than netted: ten kilos of rice
 * missing and ten kilos of flour found are two problems, not zero.
 */
export function countVariance(lines: readonly CountLine[]): {
  lines: (CountLine & { deltaMilli: number; value: number })[];
  shortage: number;
  surplus: number;
} {
  let shortage = 0;
  let surplus = 0;
  const out = lines.map((line) => {
    const deltaMilli = line.countedMilli - line.expectedMilli;
    const value = valueOf(deltaMilli, line.unitCost);
    if (value < 0) shortage += -value;
    else surplus += value;
    return { ...line, deltaMilli, value };
  });
  return { lines: out, shortage, surplus };
}

/** The ledger rows the profit and loss reads. */
export interface LedgerRow {
  reason: string;
  deltaMilli: number;
  unitCost: number | null;
}

/**
 * Waste and count differences over a period, in whole Toman.
 *
 * These are the only inventory figures that reach profit. Purchases do not —
 * buying flour turns cash into flour, it is not a cost until the flour is sold
 * (cost of goods, already on each order), binned (waste) or found missing
 * (shortage). Reading them from the ledger rather than from expense rows means
 * nothing can be entered twice.
 */
export function inventoryLosses(rows: readonly LedgerRow[]): {
  waste: number;
  shortage: number;
  surplus: number;
} {
  let waste = 0;
  let shortage = 0;
  let surplus = 0;
  for (const row of rows) {
    const value = valueOf(row.deltaMilli, row.unitCost);
    if (row.reason === "WASTE") waste += -value;
    else if (row.reason === "STOCKTAKE") {
      if (value < 0) shortage += -value;
      else surplus += value;
    }
  }
  return { waste, shortage, surplus };
}
