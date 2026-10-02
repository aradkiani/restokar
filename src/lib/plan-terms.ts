/**
 * What a plan costs and what it allows — the one place both are decided.
 *
 * Pure. Used by the pricing page, the homepage, the owner's plan picker and
 * the checkout route, so the price a person is shown and the price they are
 * charged come from the same function. Checkout calls it on the server with the
 * plan read from the database; nothing about price is ever taken from a
 * request.
 *
 * Limits: a subscription keeps a snapshot of its plan's limits from when its
 * period was bought (or its trial began). Enforcement reads that snapshot
 * first, so an admin editing a plan changes nothing for existing subscribers
 * until they renew.
 */

export interface PlanPricing {
  monthlyPrice: number;
  yearlyPrice: number;
  promoMonthlyPrice: number | null;
  promoYearlyPrice: number | null;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
}

export type BillingInterval = "monthly" | "yearly";

export function promoActive(plan: PlanPricing, now: Date): boolean {
  if (plan.promoMonthlyPrice === null && plan.promoYearlyPrice === null) return false;
  if (plan.promoStartsAt && now < plan.promoStartsAt) return false;
  if (plan.promoEndsAt && now > plan.promoEndsAt) return false;
  return true;
}

export interface EffectivePrice {
  /** What is charged now, in whole Toman. */
  amount: number;
  /** The regular price when a promotion lowers it, for a struck-through label. */
  regular: number | null;
}

export function effectivePrice(
  plan: PlanPricing,
  interval: BillingInterval,
  now: Date,
): EffectivePrice {
  const regular = interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  if (!promoActive(plan, now)) return { amount: regular, regular: null };
  const promo = interval === "yearly" ? plan.promoYearlyPrice : plan.promoMonthlyPrice;
  // A promotion only ever lowers a price; a "promo" above the regular price
  // is ignored rather than charged.
  if (promo === null || promo <= 0 || promo >= regular)
    return { amount: regular, regular: null };
  return { amount: promo, regular };
}

export interface PlanLimits {
  maxProducts: number;
  maxCategories: number;
  maxTables: number;
  maxDailyViews: number;
  allowsBranches: boolean;
  allowsOnlinePay: boolean;
  allowsAnalytics: boolean;
}

/**
 * A plan's limits as stored on a subscription or payment. The index signature
 * is what lets Prisma accept it as a JSON column value.
 */
export type LimitsSnapshot = PlanLimits & {
  planCode: string;
  [key: string]: string | number | boolean;
};

/** The limits worth snapshotting from a plan row. */
export function snapshotLimits(plan: PlanLimits & { code: string }): LimitsSnapshot {
  return {
    planCode: plan.code,
    maxProducts: plan.maxProducts,
    maxCategories: plan.maxCategories,
    maxTables: plan.maxTables,
    maxDailyViews: plan.maxDailyViews,
    allowsBranches: plan.allowsBranches,
    allowsOnlinePay: plan.allowsOnlinePay,
    allowsAnalytics: plan.allowsAnalytics,
  };
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/**
 * The limits a subscription is held to: its snapshot where present and well
 * formed, field by field, otherwise the live plan.
 */
export function effectiveLimits(snapshot: unknown, plan: PlanLimits): PlanLimits {
  const s =
    typeof snapshot === "object" && snapshot !== null
      ? (snapshot as Record<string, unknown>)
      : {};
  return {
    maxProducts: isNumber(s.maxProducts) ? s.maxProducts : plan.maxProducts,
    maxCategories: isNumber(s.maxCategories) ? s.maxCategories : plan.maxCategories,
    maxTables: isNumber(s.maxTables) ? s.maxTables : plan.maxTables,
    maxDailyViews: isNumber(s.maxDailyViews) ? s.maxDailyViews : plan.maxDailyViews,
    allowsBranches:
      typeof s.allowsBranches === "boolean" ? s.allowsBranches : plan.allowsBranches,
    allowsOnlinePay:
      typeof s.allowsOnlinePay === "boolean" ? s.allowsOnlinePay : plan.allowsOnlinePay,
    allowsAnalytics:
      typeof s.allowsAnalytics === "boolean" ? s.allowsAnalytics : plan.allowsAnalytics,
  };
}

/** Whether a subscription may run branches — its snapshot first, then the plan. */
export function allowsBranches(snapshot: unknown, planAllows: boolean): boolean {
  const s =
    typeof snapshot === "object" && snapshot !== null
      ? (snapshot as Record<string, unknown>)
      : {};
  return typeof s.allowsBranches === "boolean" ? s.allowsBranches : planAllows;
}
