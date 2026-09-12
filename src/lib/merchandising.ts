/**
 * The arithmetic shared by every merchandising surface.
 *
 * Two surfaces now push dishes at guests — suggestions in the cart and featured
 * dishes on the menu — and both answer the same question afterwards: was it
 * shown, was it acted on, did it sell, and for how much. The counts come from
 * different tables because the underlying facts differ, but the *rates* are one
 * decision and belong in one place; two copies would be two chances to define
 * "conversion" differently on two screens of the same dashboard.
 *
 * Pure, like the domain modules it serves.
 */

/**
 * What one merchandised dish did over a reporting window.
 *
 * The definitions, stated here rather than left to a dashboard label:
 *
 *   * **impressions** — guest *sessions* in which it was rendered where it
 *     could be seen. Sessions, not renders: a unique index on the event tables
 *     collapses refreshes, remounts and retries for one guest into one event.
 *   * **interactions** — sessions in which the guest acted on it. For a
 *     suggestion that is a tap; for a featured dish, opening it.
 *   * **addedToCart** — sessions in which it reached the cart *from that
 *     surface*. A guest who finds the dish on their own is not counted.
 *   * **purchases** — order *lines* attributed to the surface, in orders that
 *     were not cancelled. A fact from the order table, not a browser's report.
 *   * **revenue** — those lines' `priceSnapshot × quantity`, in whole Toman.
 */
export interface MerchandisingStats {
  impressions: number;
  interactions: number;
  addedToCart: number;
  purchases: number;
  revenue: number;
}

/**
 * A rate, guarded at both ends.
 *
 * Zero denominator gives zero, like `report-insights.ts`. The ceiling at 1 is
 * the less obvious half, and it exists because these ratios genuinely can
 * exceed it: impressions count *sessions* while adds and purchases count
 * *events and order lines*, so one guest shown a dish once can buy it twice
 * tonight and again tomorrow — and an order taken over the phone is attributed
 * with no impression at all.
 *
 * The counts either side stay exact and are both on screen, so nothing is
 * concealed. What is suppressed is only "۳۰۰٪ conversion", which tells a
 * restaurant owner nothing except that the number is broken.
 */
export function merchandisingRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(1, numerator / denominator);
}

export interface MerchandisingRates {
  /** `addedToCart / impressions`, capped at 1. */
  addRate: number;
  /** `purchases / impressions`, capped at 1. */
  conversionRate: number;
}

export function deriveRates(stats: MerchandisingStats): MerchandisingRates {
  return {
    addRate: merchandisingRatio(stats.addedToCart, stats.impressions),
    conversionRate: merchandisingRatio(stats.purchases, stats.impressions),
  };
}

/**
 * Best-earning first.
 *
 * Ranked on attributed revenue rather than conversion rate: a dish converting
 * at 80% on four impressions is noise, and an owner opening this screen is
 * asking what made money. Ties break on purchases, then impressions, so the
 * order is total rather than dependent on input order.
 */
export function rankByRevenue<T extends MerchandisingStats>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.revenue - a.revenue || b.purchases - a.purchases || b.impressions - a.impressions,
  );
}
