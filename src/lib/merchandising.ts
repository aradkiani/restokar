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
 * A proportion of one population by another, guarded at both ends.
 *
 * Zero denominator gives zero, like `report-insights.ts`. The ceiling at 1 is
 * a guard against reporting noise, **not** a unit fix — see below for why that
 * distinction turned out to matter.
 *
 * Both counts either side stay exact and are on screen, so nothing is
 * concealed. What is suppressed is only "۳۰۰٪", which tells a restaurant owner
 * nothing except that the number is broken.
 */
export function merchandisingRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(1, numerator / denominator);
}

/**
 * The figures derived from the counts — and only the ones that divide.
 *
 * ### The unit error this shape exists to prevent
 *
 * These counts are not all in the same unit. `impressions`, `interactions` and
 * `addedToCart` are **guest sessions**, collapsed by a unique index on the
 * event tables. `purchases` is **order lines**, and `revenue` is **Toman**.
 *
 * The old shape divided `purchases / impressions` and called the result a
 * conversion rate. That is order lines over sessions — two different
 * populations — and the quotient is not a proportion of anything. It routinely
 * exceeded 1 (one guest shown a dish once can buy it three times across a
 * week, and a phone order is attributed with no impression at all), and the cap
 * above quietly clamped it to "100%". An owner reading that saw a plausible
 * number whose true value was unknowable, which is worse than seeing none.
 *
 * So the division is gone, and what is left is:
 *
 *   * **`addRate`** — `addedToCart / impressions`. Sessions over sessions,
 *     genuinely a proportion: of the guests shown this, the share who took it.
 *     The cap still applies, but now it guards a dropped impression report
 *     rather than concealing a category error.
 *
 *   * **`revenuePerImpression`** — Toman over sessions. Deliberately *not* a
 *     percentage and deliberately uncapped, because it is a rate of a different
 *     kind: what one guest being shown this suggestion is worth. That is the
 *     question an owner actually has, it is answerable from these counts
 *     without mixing populations, and it ranks two suggestions honestly.
 *
 * `purchases` and `revenue` remain exact counts on screen. The one figure that
 * could not be defined cleanly is simply not reported, per the rule that an
 * undefinable attribution is better left unstated than invented.
 */
export interface MerchandisingRates {
  /** `addedToCart / impressions` — sessions over sessions, capped at 1. */
  addRate: number;
  /**
   * `revenue / impressions`, in whole Toman per session shown.
   *
   * Rounded to an integer because it is money, and because a venue comparing
   * «۱٬۲۴۰ تومان» against «۹۸۰ تومان» per guest is making exactly the decision
   * this figure exists to support. Sub-Toman precision here would be noise.
   */
  revenuePerImpression: number;
}

export function deriveRates(stats: MerchandisingStats): MerchandisingRates {
  return {
    addRate: merchandisingRatio(stats.addedToCart, stats.impressions),
    revenuePerImpression:
      stats.impressions > 0 ? Math.round(stats.revenue / stats.impressions) : 0,
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
