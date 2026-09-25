import { atRiskThreshold, daysSince, type CustomerSegment } from "./customers";

/**
 * Whether a guest is drifting away, and what an owner could do about it.
 *
 * A second *axis* over the customer book, not a second customer system.
 * `customers.ts` already answers "where is this guest in their relationship with
 * the venue" — new, returning, loyal, at risk, inactive — and campaigns already
 * target those answers. Nothing here replaces any of that.
 *
 * What it adds is the two things that answer cannot express on its own:
 *
 *   1. **The guest's own rhythm.** Thirty days of silence means something
 *      completely different from someone who came every Friday than from someone
 *      who visits each season. One fixed threshold has to be wrong for one of
 *      them.
 *   2. **What they are worth.** Value is orthogonal to lifecycle — the whole
 *      reason "a high-value customer who has gone quiet" is worth a screen of
 *      its own is that it is a *combination* of the two, and a single enum
 *      cannot hold two independent facts.
 *
 * Free of database and framework imports, like `customers.ts`, `pricing.ts` and
 * `availability.ts`. Every rule below decides something an owner will act on, so
 * all of it is testable without a database.
 *
 * **Deterministic and explainable.** No model, no scoring, no inference. Every
 * classification returns the facts that produced it, so the dashboard can say
 * «هر ۱۴ روز سفارش می‌داد، ۳۷ روز است خبری نیست» rather than asserting a verdict
 * the owner has to take on faith.
 */

// ------------------------------- thresholds --------------------------------

/**
 * Orders needed before a return interval means anything.
 *
 * Three, because two orders give one gap and one gap is not a rhythm — it is an
 * anecdote. Three orders give two gaps, which is the least that can disagree
 * with itself and therefore the least that can be called typical.
 */
export const MIN_ORDERS_FOR_INTERVAL = 3;

/**
 * Customers a venue needs before "high value" can mean anything.
 *
 * Twelve. Value here is relative to the venue's own book — there is no
 * universal figure that makes a guest valuable to both a tea house and a
 * steakhouse — and a percentile over five customers is not a distribution, it
 * is a ranking with delusions of grandeur.
 */
export const MIN_CUSTOMERS_FOR_VALUE_TIER = 12;

/**
 * Where the top of the book starts.
 *
 * The 80th percentile of customers who have actually ordered. A fifth of the
 * book is few enough to be worth an owner's individual attention and many
 * enough not to be a rounding error.
 */
export const HIGH_VALUE_PERCENTILE = 0.8;

/** Orders a guest needs before spending marks them out rather than one big night. */
export const MIN_ORDERS_FOR_HIGH_VALUE = 2;

// ---------------------------- return interval ------------------------------

/**
 * How often this guest normally comes back, in whole days.
 *
 * The **median** gap, not the mean, and that is the whole reliability story: a
 * regular who ordered weekly for a year and then took a two-month holiday has
 * one gap of sixty and fifty of seven. A mean says they visit monthly and
 * declares them healthy for the next eight weeks; a median says seven and
 * notices in a fortnight.
 *
 * Returns null below `MIN_ORDERS_FOR_INTERVAL`, which is the low-data guard the
 * rest of this module leans on — every caller then falls back to the platform's
 * fixed threshold rather than inventing a rhythm from one visit.
 *
 * Takes order instants newest-first or oldest-first; it sorts. Duplicates on the
 * same day produce zero-length gaps, which are kept: a guest who orders twice on
 * a Friday really does have a shorter typical gap than one who does not.
 */
export function typicalReturnInterval(orderDates: readonly Date[]): number | null {
  if (orderDates.length < MIN_ORDERS_FOR_INTERVAL) return null;

  const sorted = [...orderDates].sort((a, b) => a.getTime() - b.getTime());

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(daysSince(sorted[i - 1]!, sorted[i]!));
  }

  gaps.sort((a, b) => a - b);

  const middle = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? (gaps[middle - 1]! + gaps[middle]!) / 2 : gaps[middle]!;

  // Rounded to a whole day because that is the unit the figure is stated in, and
  // «هر ۱۳٫۵ روز» is precision nobody asked for.
  return Math.max(1, Math.round(median));
}

// -------------------------------- value tier -------------------------------

/**
 * How much this guest is worth relative to the rest of the book.
 *
 * Three tiers and nothing finer. An owner acts differently toward their best
 * customers than toward the rest; they do not act differently toward the 62nd
 * and 63rd percentiles, and offering them the distinction would be precision
 * pretending to be insight.
 *
 * `unknown` is a real answer, not a missing one: it is what a venue with too
 * few customers gets, and saying so is better than ranking eleven people and
 * calling two of them VIPs.
 */
export const VALUE_TIERS = ["unknown", "standard", "high"] as const;

export type ValueTier = (typeof VALUE_TIERS)[number];

/**
 * The spending level at which a customer counts as high value here.
 *
 * Derived from the venue's own customers rather than from a constant, because
 * there is no amount of Toman that means the same thing to a tea house and to a
 * steakhouse. Returns null when the book is too small for a percentile to be
 * anything but noise.
 *
 * Only customers who have actually spent are counted. Including the zero-revenue
 * rows — guests who left a number but never completed an order — would drag the
 * threshold down until nearly everyone cleared it.
 */
export function highValueThreshold(revenues: readonly number[]): number | null {
  const spending = revenues.filter((value) => value > 0).sort((a, b) => a - b);

  if (spending.length < MIN_CUSTOMERS_FOR_VALUE_TIER) return null;

  const index = Math.min(
    spending.length - 1,
    Math.floor(spending.length * HIGH_VALUE_PERCENTILE),
  );

  return spending[index]!;
}

/**
 * Which tier one customer falls in.
 *
 * Two guards, both deliberate. Without a threshold the answer is `unknown`
 * rather than a guess. And a single enormous order does not make a high-value
 * customer — it makes one large order, which is a different fact and one that a
 * venue's own revenue reports already show.
 */
export function resolveValueTier(
  customer: { totalRevenue: number; orderCount: number },
  threshold: number | null,
): ValueTier {
  if (threshold === null) return "unknown";
  if (customer.orderCount < MIN_ORDERS_FOR_HIGH_VALUE) return "standard";

  return customer.totalRevenue >= threshold ? "high" : "standard";
}

// ------------------------------ explainability -----------------------------

/**
 * Why a guest was put in the group they were put in.
 *
 * A key plus the numbers behind it, never a finished sentence — the dictionary
 * owns the wording, exactly as `report-insights.ts` and `sales-insights.ts`
 * already do. The numbers travel alongside so the dashboard can print «هر ۱۴
 * روز سفارش می‌داد» rather than a bare label the owner has to trust.
 */
export type RetentionReason =
  /** Silent for far longer than the platform's outer bound. */
  | "lapsedLongSilence"
  /** Past twice their own typical gap — the rhythm-aware answer. */
  | "atRiskOverdue"
  /** Past the fixed threshold, with too little history for a rhythm. */
  | "atRiskNoRhythm"
  /** Enough orders, recently enough, to be a regular. */
  | "loyalFrequent"
  /** More than one order and still active. */
  | "returningActive"
  /** One order, recent — nothing has gone wrong yet. */
  | "newFirstOrder"
  /** No completed orders at all. */
  | "newNoOrders";

export interface RetentionExplanation {
  reason: RetentionReason;
  /** Whole days since the last counted order; null when there is none. */
  idleDays: number | null;
  /** The guest's median gap, or null when there is too little history. */
  typicalInterval: number | null;
  /** The idle days at which this particular guest becomes overdue. */
  overdueAfter: number;
  orderCount: number;
}

/**
 * The reason behind a segment, in the same order `resolveSegment` decides it.
 *
 * Mirrors that function's branches deliberately rather than re-deriving the
 * segment: this explains a decision already made, and a second copy of the rule
 * would eventually explain something the customer book does not show.
 */
export function explainSegment(input: {
  segment: CustomerSegment;
  orderCount: number;
  idleDays: number | null;
  typicalInterval: number | null;
}): RetentionExplanation {
  const overdueAfter = atRiskThreshold(input.typicalInterval);

  const base = {
    idleDays: input.idleDays,
    typicalInterval: input.typicalInterval,
    overdueAfter,
    orderCount: input.orderCount,
  };

  switch (input.segment) {
    case "inactive":
      return { ...base, reason: "lapsedLongSilence" };
    case "atRisk":
      return {
        ...base,
        reason: input.typicalInterval === null ? "atRiskNoRhythm" : "atRiskOverdue",
      };
    case "loyal":
      return { ...base, reason: "loyalFrequent" };
    case "returning":
      return { ...base, reason: "returningActive" };
    case "new":
    default:
      return {
        ...base,
        reason: input.orderCount === 0 ? "newNoOrders" : "newFirstOrder",
      };
  }
}

// ----------------------------- opportunities -------------------------------

/**
 * A group of customers worth doing something about, and why.
 *
 * Deliberately *groups*, not per-customer nudges. An owner with four hundred
 * guests cannot act on four hundred suggestions; they can act on "nineteen
 * people bought once last month and never came back". Each one maps to a filter
 * the customer list already supports, so "show me" is a link rather than a new
 * screen.
 */
export const RETENTION_OPPORTUNITIES = [
  /** Bought once, never returned, still recent enough to be winnable. */
  "firstToSecond",
  /** Valuable *and* overdue — the most expensive silence in the book. */
  "highValueAtRisk",
  /** Had a real habit, now long gone. */
  "winBack",
  /** Ordering regularly right now; worth keeping. */
  "activeRegulars",
] as const;

export type RetentionOpportunityKey = (typeof RETENTION_OPPORTUNITIES)[number];

export interface RetentionOpportunity {
  key: RetentionOpportunityKey;
  /** How many customers are in it. Never zero — empty ones are not returned. */
  count: number;
  /** Their combined historical revenue, so an owner can see what is at stake. */
  revenueAtStake: number;
  /** The customer-list filter that shows exactly this group. */
  filter: { segment?: CustomerSegment; valueTier?: ValueTier };
}

/** One customer, reduced to what the opportunity rules actually read. */
export interface RetentionCandidate {
  segment: CustomerSegment;
  valueTier: ValueTier;
  orderCount: number;
  totalRevenue: number;
  idleDays: number | null;
}

/**
 * Which groups are worth showing, largest stake first.
 *
 * Every rule is a plain count over the book — there is no scoring and no
 * ranking model. Empty groups are dropped rather than rendered as zero: "0
 * customers at risk" is not reassurance, it is a card an owner has to read and
 * discard every time they open the page.
 *
 * `firstToSecond` deliberately excludes guests who have already gone quiet for
 * good. A first-timer from last week is winnable; one from five months ago is a
 * different problem, and lumping them together would make the count useless for
 * deciding what to do this week.
 */
export function detectOpportunities(
  candidates: readonly RetentionCandidate[],
): RetentionOpportunity[] {
  const groups: Record<RetentionOpportunityKey, RetentionCandidate[]> = {
    firstToSecond: [],
    highValueAtRisk: [],
    winBack: [],
    activeRegulars: [],
  };

  for (const candidate of candidates) {
    if (candidate.orderCount === 1 && candidate.segment === "new") {
      groups.firstToSecond.push(candidate);
    }

    if (candidate.segment === "atRisk" && candidate.valueTier === "high") {
      groups.highValueAtRisk.push(candidate);
    }

    // A real habit that stopped — not someone who tried the place once and
    // drifted, which is `firstToSecond`'s problem and needs a different answer.
    if (candidate.segment === "inactive" && candidate.orderCount >= 2) {
      groups.winBack.push(candidate);
    }

    if (candidate.segment === "loyal") {
      groups.activeRegulars.push(candidate);
    }
  }

  const filters: Record<RetentionOpportunityKey, RetentionOpportunity["filter"]> = {
    firstToSecond: { segment: "new" },
    highValueAtRisk: { segment: "atRisk", valueTier: "high" },
    winBack: { segment: "inactive" },
    activeRegulars: { segment: "loyal" },
  };

  return RETENTION_OPPORTUNITIES.flatMap((key) => {
    const members = groups[key];
    if (members.length === 0) return [];

    return [
      {
        key,
        count: members.length,
        revenueAtStake: members.reduce((sum, m) => sum + m.totalRevenue, 0),
        filter: filters[key],
      },
    ];
  }).sort((a, b) => b.revenueAtStake - a.revenueAtStake || b.count - a.count);
}

// ------------------------------- book summary ------------------------------

/**
 * What a venue can honestly say about its customer base as a whole.
 *
 * Every figure here is a count or a ratio of counts over customers the venue
 * already has. Nothing is modelled, projected or smoothed.
 *
 * `repeatRate` counts customers, not orders: "what share of my guests came
 * back" is the retention question, while "what share of my orders were repeat
 * business" is a revenue question `analytics.ts` already answers. Mixing the two
 * denominators is exactly the unit error the merchandising metrics had.
 */
export interface RetentionSummary {
  /** Customers with at least one counted order. The honest denominator. */
  withOrders: number;
  /** Of those, how many ordered more than once. */
  repeatCustomers: number;
  /** `repeatCustomers / withOrders`, 0 when nobody has ordered. */
  repeatRate: number;
  /** Mean lifetime revenue across customers who have ordered. */
  averageLifetimeValue: number;
  /** Mean counted orders across customers who have ordered. */
  averageOrders: number;
}

export function summariseRetention(
  candidates: readonly { orderCount: number; totalRevenue: number }[],
): RetentionSummary {
  const active = candidates.filter((c) => c.orderCount > 0);

  if (active.length === 0) {
    return {
      withOrders: 0,
      repeatCustomers: 0,
      repeatRate: 0,
      averageLifetimeValue: 0,
      averageOrders: 0,
    };
  }

  const repeatCustomers = active.filter((c) => c.orderCount >= 2).length;
  const revenue = active.reduce((sum, c) => sum + c.totalRevenue, 0);
  const orders = active.reduce((sum, c) => sum + c.orderCount, 0);

  return {
    withOrders: active.length,
    repeatCustomers,
    repeatRate: repeatCustomers / active.length,
    // Floored, like `averageOrderValue` in customers.ts: a fractional Toman is
    // not a unit anyone can be charged.
    averageLifetimeValue: Math.floor(revenue / active.length),
    averageOrders: orders / active.length,
  };
}
