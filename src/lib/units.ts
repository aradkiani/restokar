/**
 * Units an ingredient can be stocked, priced and used in.
 *
 * Three dimensions — weight, volume and count — each with a base unit and the
 * units a kitchen actually uses alongside it. A unit belongs to exactly one
 * dimension, and conversion is only defined inside one: 230 grams of a
 * kilogram item is 0.23 kg, while "230 grams of a litre" is a mistake that is
 * refused rather than guessed at.
 *
 * Replaces free-text units. "کیلوگرم" typed as text was a label and nothing
 * more — the platform could not know that a dish using 230 گرم of it takes
 * 0.23 of the shelf, or that flour at 45,000 a kilogram costs 10,350 for that
 * dish. A catalogue is what makes both of those arithmetic.
 *
 * Pure: no database, no framework. The unit codes are also enforced by a CHECK
 * constraint in the migration that introduced them; the two lists must match.
 */

export const DIMENSIONS = ["weight", "volume", "count"] as const;

export type Dimension = (typeof DIMENSIONS)[number];

interface UnitSpec {
  dimension: Dimension;
  /** How many base units one of this is: grams, millilitres or pieces. */
  toBase: number;
}

/**
 * The catalogue. Order is the order the UI offers them in.
 *
 *   - **Spoons** are the standard culinary measures (5 ml, 15 ml). They are
 *     approximations of what a cook's spoon holds, but they are the unit a
 *     recipe is written in, and costing "one spoon of oil" at 15 ml is far
 *     closer than leaving it uncosted.
 *   - **دوجین** is twelve. A count has sub-units too: half a lemon is 0.5 of
 *     a piece, which the thousandths storage already represents.
 */
const UNITS = {
  g: { dimension: "weight", toBase: 1 },
  kg: { dimension: "weight", toBase: 1_000 },
  ml: { dimension: "volume", toBase: 1 },
  l: { dimension: "volume", toBase: 1_000 },
  tsp: { dimension: "volume", toBase: 5 },
  tbsp: { dimension: "volume", toBase: 15 },
  piece: { dimension: "count", toBase: 1 },
  dozen: { dimension: "count", toBase: 12 },
} as const satisfies Record<string, UnitSpec>;

export type UnitCode = keyof typeof UNITS;

export const UNIT_CODES = Object.keys(UNITS) as UnitCode[];

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === "string" && Object.hasOwn(UNITS, value);
}

export function dimensionOf(unit: UnitCode): Dimension {
  return UNITS[unit].dimension;
}

/** Every unit that can stand in for `unit`, itself included. */
export function compatibleUnits(unit: UnitCode): UnitCode[] {
  const dimension = dimensionOf(unit);
  return UNIT_CODES.filter((code) => UNITS[code].dimension === dimension);
}

export function sameDimension(a: UnitCode, b: UnitCode): boolean {
  return dimensionOf(a) === dimensionOf(b);
}

/**
 * `amount` of `from`, expressed in `to`. Null when the two are not the same
 * kind of thing.
 *
 * Null rather than a throw: every caller is turning user input into a stored
 * figure, and "these do not convert" is an answer to show the owner, not a
 * crash.
 */
export function convert(amount: number, from: UnitCode, to: UnitCode): number | null {
  if (!sameDimension(from, to)) return null;
  if (from === to) return amount;
  return (amount * UNITS[from].toBase) / UNITS[to].toBase;
}

/** Thousandths, the storage resolution of every stock and recipe amount. */
const MILLI = 1_000;

/**
 * A recipe amount typed in `entryUnit`, as the thousandths of `itemUnit` it is
 * stored as.
 *
 * 230 g of a kilogram item is 230 thousandths of a kilogram. Null when the
 * units do not convert, and also when the amount is too small to register at
 * the item's resolution: 0.2 g of a *kilogram* item rounds to nothing, and
 * storing a zero would cost and deduct nothing while the owner believes it
 * does. That item should be stocked in grams instead, and the caller says so.
 */
export function toItemMilli(
  amount: number,
  entryUnit: UnitCode,
  itemUnit: UnitCode,
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const inItemUnit = convert(amount, entryUnit, itemUnit);
  if (inItemUnit === null) return null;

  const milli = Math.round(inItemUnit * MILLI);
  return milli > 0 ? milli : null;
}

/** Stored thousandths of `itemUnit`, read back in `displayUnit`. */
export function fromItemMilli(
  milli: number,
  itemUnit: UnitCode,
  displayUnit: UnitCode,
): number | null {
  return convert((milli || 0) / MILLI, itemUnit, displayUnit);
}

/**
 * The code a legacy free-text unit maps to.
 *
 * The same table the migration applied in SQL, kept here so any path that
 * still receives an old label — an import, an old client — lands on the same
 * answer. Unrecognised text becomes a count: the one reading that never invents
 * a weight or a volume the owner did not state.
 *
 * مثقال (4.608 g) is no longer a unit. An old label or code reads as grams, so
 * it is never mistaken for a count; a caller holding a *quantity* in mesghal
 * must multiply it by 4.608, which the restore trigger does in SQL.
 */
export function legacyUnitCode(text: string | null | undefined): UnitCode {
  const value = (text ?? "").trim();
  if (isUnitCode(value)) return value;

  const table: Record<string, UnitCode> = {
    گرم: "g",
    کیلوگرم: "kg",
    کیلو: "kg",
    مثقال: "g",
    mesghal: "g",
    میلی‌لیتر: "ml",
    "میلی لیتر": "ml",
    سی‌سی: "ml",
    لیتر: "l",
    عدد: "piece",
    دوجین: "dozen",
  };
  return table[value] ?? "piece";
}
