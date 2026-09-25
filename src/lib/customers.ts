import { startOfDayInZone } from "./time";

/**
 * Who a restaurant's regulars are, derived from what they actually bought.
 *
 * Not a CRM. The whole model is: a phone number that has ordered before is a
 * returning guest, and how recently and how often they ordered says what kind
 * of guest they are. Everything here is computed from orders the venue already
 * has — nothing is collected that ordering did not already require.
 *
 * Free of database and framework imports, like `pricing.ts`, `availability.ts`
 * and `featured.ts`. The segment rules decide what an owner believes about
 * their customers, so they are worth testing directly, and they must not be
 * re-stated in a dashboard component where they could drift.
 */

// ------------------------------ thresholds ---------------------------------

/**
 * Orders that make a guest a regular rather than a repeat visitor.
 *
 * Five, for a café or restaurant where a genuine regular comes weekly-ish: it
 * is comfortably past the two or three visits a curious newcomer makes, and low
 * enough that a venue with a season of history has a meaningful loyal group to
 * look at. Not a universal truth — a fine-dining room's regular might visit
 * five times a year — which is why it lives here as one named constant.
 */
export const LOYAL_ORDER_THRESHOLD = 5;

/**
 * Silence that is worth noticing from someone who used to come back.
 *
 * Thirty days: a month is the shortest gap that means something for a habit
 * measured in weeks, and it is early enough that the relationship is still
 * recoverable — which is the entire point of naming the segment.
 */
export const AT_RISK_DAYS = 30;

/**
 * Silence long enough to call the relationship over for now.
 *
 * Ninety days. Deliberately well past AT_RISK: a guest who has not been seen
 * for a quarter is a different fact from one who missed a month, and treating
 * them the same would make both labels useless.
 */
export const INACTIVE_DAYS = 90;

/**
 * How far past their *own* usual gap a guest has to be before it is worth
 * saying.
 *
 * Twice. A weekly regular who misses one week is on holiday; one who misses two
 * has changed something. Below 2× this would cry wolf at every business trip,
 * and an alert an owner learns to ignore is worse than no alert.
 */
export const OVERDUE_FACTOR = 2;

/**
 * The soonest anyone is called at risk, however tight their rhythm.
 *
 * A guest who buys coffee every morning has a one-day interval, and twice that
 * is two days. Nobody has churned in two days. Fourteen is the floor at which
 * silence from even the most frequent guest is a fact rather than a weekend.
 */
export const MIN_AT_RISK_DAYS = 14;

/**
 * The latest anyone is called at risk, however slow their rhythm.
 *
 * Sixty days, which is two thirds of the way to `INACTIVE_DAYS`. The obvious
 * ceiling is `INACTIVE_DAYS - 1`, and it is wrong: a seasonal diner on a 45-day
 * rhythm is twice overdue at 90 days, which is the exact day they are written
 * off anyway. That leaves a one-day window in which an owner could notice and
 * act, which is no window at all.
 *
 * Sixty guarantees every guest at least a month of being visibly in trouble
 * while the relationship is still recoverable — which is the only reason the
 * "at risk" group exists.
 */
export const MAX_AT_RISK_DAYS = 60;

/**
 * How many idle days make *this particular* guest overdue.
 *
 * `AT_RISK_DAYS` is one number applied to everyone, which has to be wrong for
 * someone: thirty days of silence means something entirely different from a
 * guest who came every Friday than from one who visits each season. Where there
 * is enough history to know a guest's rhythm, this scales the threshold to it.
 *
 * Bounded at both ends, and both bounds matter:
 *
 *   * The **floor** stops a daily regular being written off over a long weekend.
 *   * The **ceiling** guarantees a guest passes through "at risk" — where an
 *     owner can still act — with time to spare before arriving at "inactive",
 *     where the relationship is already over. A seasonal diner on a 45-day
 *     rhythm is twice overdue on the very day they are written off, so without
 *     a ceiling they are never actionably flagged at all.
 *
 * With no known rhythm this returns the platform's existing fixed threshold
 * unchanged, which is what keeps every current caller behaving exactly as it
 * did. The rhythm itself is computed by `typicalReturnInterval` in
 * `retention.ts`; it lives there because deriving a median from order history is
 * a different job from deciding what the median means.
 */
export function atRiskThreshold(typicalInterval: number | null): number {
  if (typicalInterval === null) return AT_RISK_DAYS;

  return Math.min(
    MAX_AT_RISK_DAYS,
    Math.max(MIN_AT_RISK_DAYS, typicalInterval * OVERDUE_FACTOR),
  );
}

/**
 * Paging bounds for the customer list.
 *
 * Here rather than beside the query that uses them because the request schema
 * validates against `MAX_PAGE_SIZE`, and that schema is imported by client
 * code — a constant behind a `server-only` marker would drag the whole database
 * module into the browser bundle.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// -------------------------------- segments ---------------------------------

export const CUSTOMER_SEGMENTS = [
  "new",
  "returning",
  "loyal",
  "atRisk",
  "inactive",
] as const;

export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export function isCustomerSegment(value: string): value is CustomerSegment {
  return (CUSTOMER_SEGMENTS as readonly string[]).includes(value);
}

/** What the segment rules need. Everything is derived from counted orders. */
export interface SegmentInput {
  /** Orders that count — see `COUNTED` in analytics.ts. */
  orderCount: number;
  lastOrderAt: Date | null;
  /**
   * The guest's own median gap between orders, in days, when it is knowable.
   *
   * Optional, and absent is the honest default: below three orders there is no
   * rhythm to speak of, and inventing one from a single visit is exactly the
   * fake precision this feature must not have. When it is absent the fixed
   * `AT_RISK_DAYS` applies, which is what every caller predating this field
   * already got.
   */
  typicalInterval?: number | null;
}

/**
 * Whole days between two instants, counted in the venue's own calendar.
 *
 * Calendar days rather than elapsed milliseconds, so an order placed at 11pm
 * last night is "1 day ago" rather than "0.4 days ago" — which is what an owner
 * means by the phrase, and what makes a 30-day threshold land on a date rather
 * than on a time of day. Uses the same zone anchor every trading day in this
 * codebase already uses.
 */
export function daysSince(instant: Date, now: Date): number {
  const from = startOfDayInZone(instant).getTime();
  const to = startOfDayInZone(now).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Which segment a customer falls into.
 *
 * Ordered outermost-first, and the order is the design:
 *
 *   1. **Inactive** beats everything. A guest last seen four months ago is not
 *      a loyal customer whatever their order count says, and labelling them one
 *      would tell an owner their retention is healthy when it is not.
 *   2. **At risk** applies only to someone who *had* a habit. A single visit
 *      five weeks ago is not a lapsed relationship, it is a guest who tried the
 *      place once — so a one-time customer stays `new` until they go quiet long
 *      enough to be `inactive`.
 *   3. **Loyal** then **returning**, on order count.
 *
 * A customer with no counted orders is `new`: they exist because they gave a
 * phone number, and nothing they have done yet says otherwise.
 *
 * **Step 2 is measured against the guest's own rhythm** where there is enough
 * history to know it — see `atRiskThreshold`. A weekly regular is overdue after
 * a fortnight; a seasonal diner is not overdue at thirty days. With too little
 * history the fixed threshold applies, exactly as it always did, so a caller
 * that passes no interval gets precisely its previous behaviour.
 */
export function resolveSegment(input: SegmentInput, now: Date): CustomerSegment {
  if (input.orderCount === 0 || !input.lastOrderAt) return "new";

  const idleDays = daysSince(input.lastOrderAt, now);

  if (idleDays >= INACTIVE_DAYS) return "inactive";
  if (
    idleDays >= atRiskThreshold(input.typicalInterval ?? null) &&
    input.orderCount >= 2
  ) {
    return "atRisk";
  }
  if (input.orderCount >= LOYAL_ORDER_THRESHOLD) return "loyal";
  if (input.orderCount >= 2) return "returning";

  return "new";
}

// -------------------------------- metrics ----------------------------------

/**
 * What a restaurant knows about one guest.
 *
 * Every figure is derived from counted orders rather than stored on a customer
 * row, so nothing can drift out of step with the orders it describes. The
 * definitions, stated once:
 *
 *   * **orderCount** — orders that were not cancelled. The platform's existing
 *     rule (`COUNTED` in analytics.ts), not a second one invented here.
 *   * **totalRevenue** — the sum of `netRevenue` for those orders:
 *     `total − tax − tip`. Tax is the state's and a tip is the staff's, so
 *     neither is money the venue earned from this guest.
 *   * **averageOrderValue** — `totalRevenue / orderCount`, on the same basis.
 *   * **firstOrderAt / lastOrderAt** — by `placedAt`, the order's own clock.
 *   * **daysSinceLastOrder** — whole calendar days in the venue's zone.
 */
export interface CustomerMetrics {
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  daysSinceLastOrder: number | null;
}

export interface CustomerRecord extends CustomerMetrics {
  id: string;
  phone: string;
  name: string | null;
  marketingConsent: boolean;
  segment: CustomerSegment;
  /**
   * The guest's median gap between orders, or null when there is too little
   * history to say. Carried so the dashboard can show its working rather than
   * asserting a verdict — see `explainSegment` in `retention.ts`.
   */
  typicalInterval: number | null;
}

/** Rounded down: a fractional Toman is not a unit anyone can be charged. */
export function averageOrderValue(totalRevenue: number, orderCount: number): number {
  return orderCount > 0 ? Math.floor(totalRevenue / orderCount) : 0;
}

/**
 * Assembles the derived view of one customer.
 *
 * Takes already-aggregated figures rather than orders: the aggregation belongs
 * in SQL, where it stays fast as a venue's history grows, and this stays a pure
 * function of five numbers.
 */
export function deriveCustomer(
  input: {
    id: string;
    phone: string;
    name: string | null;
    marketingConsent: boolean;
    orderCount: number;
    totalRevenue: number;
    firstOrderAt: Date | null;
    lastOrderAt: Date | null;
    /**
     * The guest's median gap between orders, when it is knowable.
     *
     * Supplied rather than computed here for the same reason the totals are:
     * this stays a pure function of already-aggregated figures. The caller gets
     * it from `typicalReturnInterval` in `retention.ts`, which is also what
     * keeps the two modules' imports flowing one way.
     */
    typicalInterval?: number | null;
  },
  now: Date,
): CustomerRecord {
  const typicalInterval = input.typicalInterval ?? null;

  return {
    id: input.id,
    phone: input.phone,
    name: input.name,
    marketingConsent: input.marketingConsent,
    orderCount: input.orderCount,
    totalRevenue: input.totalRevenue,
    averageOrderValue: averageOrderValue(input.totalRevenue, input.orderCount),
    firstOrderAt: input.firstOrderAt,
    lastOrderAt: input.lastOrderAt,
    daysSinceLastOrder: input.lastOrderAt ? daysSince(input.lastOrderAt, now) : null,
    typicalInterval,
    segment: resolveSegment(
      {
        orderCount: input.orderCount,
        lastOrderAt: input.lastOrderAt,
        typicalInterval,
      },
      now,
    ),
  };
}

// ----------------------------- communication -------------------------------

/**
 * Whether this guest could be contacted, if the platform ever sends anything.
 *
 * No provider, no sending, no campaign — only the question a future one would
 * have to ask first, kept here so that adding it later is a matter of choosing
 * a gateway rather than backfilling consent nobody recorded.
 *
 * Both conditions are required on purpose: a usable number is not permission,
 * and permission without a number is not reachability.
 */
export function canBeContacted(customer: {
  phone: string | null;
  marketingConsent: boolean;
}): boolean {
  return Boolean(customer.phone) && customer.marketingConsent;
}
