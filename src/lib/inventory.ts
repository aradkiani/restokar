import { toEnglishDigits } from "./format";

/**
 * Ingredient stock.
 *
 * Free of any database import, like pricing.ts and discounts.ts, so the
 * arithmetic that decides what is on the shelf can be tested on its own.
 *
 * Quantities are held as **thousandths of the owner's declared unit** in an Int
 * column, never as a float. A kitchen works in 0.25 kg and 1.5 L, and a float
 * drifts a little on every deduction until the figure on screen stops matching
 * the shelf — the same reason money is whole Toman in this codebase. The unit
 * itself is free text ("کیلوگرم", "عدد", "لیتر"), because a venue counting
 * saffron in grams and dough in pieces should not have to pick from our list.
 */

/** Thousandths: one gram of a kilogram, one millilitre of a litre. */
export const UNIT_DECIMALS = 3;
const SCALE = 10 ** UNIT_DECIMALS;

/** A declared quantity in the owner's unit → the stored integer. */
export function toMilli(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * SCALE);
}

export function fromMilli(milli: number): number {
  return (milli || 0) / SCALE;
}

/**
 * Reads a quantity the way it was typed.
 *
 * Persian digits, either decimal separator, and thousands separators pasted in
 * with the number. `Number("۲٫۵")` is NaN, and a silent NaN here is how the
 * discount form ended up appearing to do nothing at all.
 */
export function parseQuantity(input: string): number {
  const normalised = toEnglishDigits(String(input ?? ""))
    // Persian and Arabic decimal separators, then the plain one.
    .replace(/[٫،]/g, ".")
    // Thousands separators, which carry no meaning once digits are normalised.
    .replace(/[,٬\s]/g, "");

  const cleaned = normalised.replace(/[^\d.]/g, "");
  const value = Number(cleaned);
  return toMilli(value);
}

/** Stored integer → a short human string, without trailing zeros. */
export function formatQuantity(milli: number): string {
  const value = fromMilli(milli);
  return String(Number(value.toFixed(UNIT_DECIMALS)));
}

/**
 * Whether an item should be warned about.
 *
 * Fires **at or below** the threshold, which is the entire point: an owner
 * needs to reorder while there is still something left, not once the shelf is
 * bare. A threshold of zero means "do not watch this one" rather than "warn
 * always" — an ingredient nobody has thought about should not nag.
 */
export function isLowStock(item: {
  quantityMilli: number;
  lowStockMilli: number;
}): boolean {
  if (!item.lowStockMilli || item.lowStockMilli <= 0) return false;
  return item.quantityMilli <= item.lowStockMilli;
}

/**
 * What an order takes off the shelves.
 *
 * Returns item id → amount consumed, summed across every line, so an ingredient
 * used by two different dishes on the same order is deducted once with the
 * total. Dishes with no recipe recorded contribute nothing: recipes are
 * optional per dish, so a venue can track only the ingredients that matter to
 * it rather than having to describe its whole menu before the feature does
 * anything.
 */
export function consumptionFor(
  lines: readonly { productId: string; quantity: number }[],
  recipes: readonly { productId: string; itemId: string; perUnitMilli: number }[],
): Record<string, number> {
  const byProduct = new Map<string, typeof recipes>();
  for (const recipe of recipes) {
    const list = byProduct.get(recipe.productId) ?? [];
    byProduct.set(recipe.productId, [...list, recipe] as typeof recipes);
  }

  const out: Record<string, number> = {};
  for (const line of lines) {
    for (const recipe of byProduct.get(line.productId) ?? []) {
      const amount = recipe.perUnitMilli * line.quantity;
      if (amount > 0) out[recipe.itemId] = (out[recipe.itemId] ?? 0) + amount;
    }
  }
  return out;
}
