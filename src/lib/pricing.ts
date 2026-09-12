/**
 * Turns a basket subtotal into what the guest actually pays.
 *
 * Kept separate from orders.ts and free of any database import so the money
 * arithmetic can be tested directly — this is the code that decides what a
 * customer is charged, and it is the last place a rounding slip should go
 * unnoticed.
 *
 * Order of operations, which is the conventional one and the reason each step
 * is applied to the running total rather than to the raw subtotal:
 *
 *   1. subtotal        — sum of line prices
 *   2. − discount      — reserved; nothing writes it yet
 *   3. + service charge — a percentage of the discounted basket
 *   4. + tax            — VAT, charged on the basket *including* service
 *   5. rounding         — applied to the payable figure, not to the tax base
 *   6. + tip            — the guest's own money: never taxed, never rounded away
 *
 * Every amount is whole Toman, matching the Int columns it is stored in.
 */

export type RoundingDirection = "up" | "down" | "nearest";

export interface PricingOptions {
  taxEnabled: boolean;
  taxPercent: number;
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
  roundingIncrement: number;
  roundingDirection: string;
}

export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  /** Signed: negative when rounding down, positive when rounding up. */
  roundingAdjustment: number;
  tip: number;
  total: number;
}

/** Percentages are whole numbers; a bad value must never inflate a bill. */
function percentOf(amount: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((amount * percent) / 100);
}

/**
 * Rounds to a whole increment of Toman.
 *
 * `nearest` is the default because it is the fairest of the three; `up` is what
 * a venue picks when it wants clean cash amounts, `down` when it would rather
 * absorb the difference than surprise a guest.
 */
export function roundToIncrement(
  amount: number,
  increment: number,
  direction: string,
): number {
  if (!Number.isFinite(increment) || increment <= 1) return amount;
  const steps = amount / increment;

  const rounded =
    direction === "up"
      ? Math.ceil(steps)
      : direction === "down"
        ? Math.floor(steps)
        : Math.round(steps);

  return rounded * increment;
}

export function calculatePrice(
  subtotal: number,
  options: PricingOptions,
  extras: { discount?: number; tip?: number } = {},
): PriceBreakdown {
  const safeSubtotal = Math.max(0, Math.round(subtotal || 0));
  // A discount can never exceed the basket, or the total goes negative and the
  // tax base with it.
  const discount = Math.min(safeSubtotal, Math.max(0, Math.round(extras.discount ?? 0)));
  const net = safeSubtotal - discount;

  const serviceCharge = options.serviceChargeEnabled
    ? percentOf(net, options.serviceChargePercent)
    : 0;

  const tax = options.taxEnabled ? percentOf(net + serviceCharge, options.taxPercent) : 0;

  const beforeRounding = net + serviceCharge + tax;
  const rounded = roundToIncrement(
    beforeRounding,
    options.roundingIncrement,
    options.roundingDirection,
  );
  // Never let rounding-down turn a real basket into a free one.
  const payable = Math.max(0, rounded);
  const roundingAdjustment = payable - beforeRounding;

  const tip = Math.max(0, Math.round(extras.tip ?? 0));

  return {
    subtotal: safeSubtotal,
    discount,
    serviceCharge,
    tax,
    roundingAdjustment,
    tip,
    total: payable + tip,
  };
}
