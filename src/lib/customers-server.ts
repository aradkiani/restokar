import "server-only";
import { prisma } from "./prisma";
import { normalisePhone } from "./phone";
import { COUNTED_ORDER, countedOrderSql } from "./order-status";
import {
  CUSTOMER_SEGMENTS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  deriveCustomer,
  type CustomerRecord,
  type CustomerSegment,
} from "./customers";
import {
  detectOpportunities,
  explainSegment,
  highValueThreshold,
  resolveValueTier,
  summariseRetention,
  typicalReturnInterval,
  type RetentionExplanation,
  type RetentionOpportunity,
  type RetentionSummary,
  type ValueTier,
} from "./retention";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The database half of customer data. The rules are in `customers.ts`, which
 * stays pure; this is identity, aggregation and tenant scoping.
 *
 * Two things every function here holds to:
 *
 *   * **The tenant comes from the session.** Every read is scoped to a
 *     `restaurantId` the caller proved they own, never one they supplied.
 *   * **Metrics are aggregated in SQL.** A venue with three years of history
 *     has tens of thousands of orders, and totalling them in Node would get
 *     slower every month. `groupBy` keeps the work in the database.
 */

/**
 * Orders that count toward what a venue knows about a guest.
 *
 * The platform's existing rule, imported in spirit from `analytics.ts` rather
 * than reinvented: a cancelled order is not a sale, and every revenue figure in
 * the product already excludes it. A refund is recorded on a cancelled order,
 * so this covers refunds too without a second rule.
 *
 * Orders still in the kitchen — RECEIVED, PREPARING, READY — do count. They are
 * real sales in progress, and excluding them would make today's regulars
 * disappear until service ended.
 */
const COUNTED = COUNTED_ORDER;

/**
 * Finds or creates the customer record an order belongs to.
 *
 * Returns `null` when no usable number was given, which is the common case for
 * a walk-in reading a QR code: ordering has never required a phone number and
 * this does not change that. An order with no customer is simply not attributed
 * to anyone.
 *
 * `menuOwnerId` rather than the branch that served the order — a guest who eats
 * at two branches of one chain is one customer of that chain, and the tenancy
 * model already puts everything the chain owns on the parent.
 *
 * The upsert is what makes a returning guest *be* returning: the unique index
 * on `(restaurantId, phone)` means two simultaneous orders from the same number
 * converge on one record rather than racing to create two.
 */
export async function linkCustomer(
  tx: Prisma.TransactionClient,
  menuOwnerId: string,
  input: { phone: string | null; name: string },
): Promise<string | null> {
  // Normalised again rather than trusted: this is the column the identity is
  // keyed on, and one unnormalised write would split a regular into two people.
  const phone = normalisePhone(input.phone);
  if (!phone) return null;

  const name = input.name.trim() || null;

  const customer = await tx.customer.upsert({
    where: { restaurantId_phone: { restaurantId: menuOwnerId, phone } },
    // The most recent name wins. A guest who gave a fuller name this time is
    // telling us something; keeping the first one forever is not respect for
    // history, it is a stale record.
    update: name ? { name } : {},
    create: { restaurantId: menuOwnerId, phone, name },
    select: { id: true },
  });

  return customer.id;
}

// ------------------------------ aggregation --------------------------------

interface Aggregate {
  orderCount: number;
  totalRevenue: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  /**
   * When this guest ordered, newest first, capped.
   *
   * Needed to know their rhythm — `typicalReturnInterval` takes the median gap
   * between orders, and a median cannot be computed from `MIN`/`MAX` alone.
   *
   * Capped at `INTERVAL_SAMPLE` because a median is a median: the twelve most
   * recent visits describe how a guest behaves *now*, while three years of
   * history would let a habit they abandoned last spring outvote the one they
   * have today. It also bounds the array a venue's busiest regular can produce.
   *
   * `array_agg` keeps this in the same single pass as the totals, so adding it
   * costs no extra query.
   */
  orderDates: Date[];
}

/**
 * How many recent orders decide a guest's rhythm. See `orderDates`.
 *
 * Twelve: enough gaps for a median to be stable, few enough that it reflects
 * current behaviour rather than the whole relationship.
 */
const INTERVAL_SAMPLE = 12;

/**
 * Per-customer totals, computed by the database.
 *
 * `total - tax - tip` is `netRevenue` from `analytics.ts` — the platform's
 * definition of what a venue actually earned, with the state's tax and the
 * staff's tips removed. Expressed as raw SQL here because Prisma's `groupBy`
 * can sum a column but not an expression, and the alternative is streaming
 * every order into Node to subtract two numbers.
 *
 * One query for any number of customers, so nothing here is N+1.
 */
async function aggregateFor(
  restaurantId: string,
  customerIds: readonly string[],
): Promise<Map<string, Aggregate>> {
  if (customerIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    {
      customerId: string;
      orderCount: bigint;
      totalRevenue: bigint | null;
      firstOrderAt: Date | null;
      lastOrderAt: Date | null;
      orderDates: Date[] | null;
    }[]
  >`
    SELECT o."customerId",
           COUNT(*)                                   AS "orderCount",
           SUM(o."total" - o."tax" - o."tip")         AS "totalRevenue",
           MIN(o."placedAt")                          AS "firstOrderAt",
           MAX(o."placedAt")                          AS "lastOrderAt",
           -- The most recent visits, for the median gap between them. Ordered
           -- and sliced inside the aggregate so a regular with a thousand
           -- orders still returns twelve dates rather than a thousand.
           (array_agg(o."placedAt" ORDER BY o."placedAt" DESC))[1:${INTERVAL_SAMPLE}]
                                                      AS "orderDates"
      FROM "Order" o
      JOIN "Customer" c ON c."id" = o."customerId"
     WHERE o."customerId" = ANY(${customerIds as string[]})
       AND ${countedOrderSql("o")}
       -- Scoped through the customer's own tenant as well as the id list, so a
       -- guessed id from another venue aggregates to nothing rather than to
       -- somebody else's orders.
       AND c."restaurantId" = ${restaurantId}
     GROUP BY o."customerId"
  `;

  return new Map(
    rows.map((row) => [
      row.customerId,
      {
        orderCount: Number(row.orderCount),
        totalRevenue: Number(row.totalRevenue ?? 0),
        firstOrderAt: row.firstOrderAt,
        lastOrderAt: row.lastOrderAt,
        orderDates: row.orderDates ?? [],
      },
    ]),
  );
}

const EMPTY: Aggregate = {
  orderCount: 0,
  totalRevenue: 0,
  firstOrderAt: null,
  lastOrderAt: null,
  orderDates: [],
};

/**
 * One customer row plus its totals, turned into the derived record.
 *
 * The one place the rhythm is computed, so the customer book, the segment
 * counts and the detail view cannot disagree about how often a guest visits.
 * `typicalReturnInterval` applies its own low-data guard and answers null below
 * three orders, which `resolveSegment` then reads as "use the fixed threshold".
 */
function deriveFrom(
  row: { id: string; phone: string; name: string | null; marketingConsent: boolean },
  aggregate: Aggregate,
  now: Date,
): CustomerRecord {
  return deriveCustomer(
    {
      ...row,
      orderCount: aggregate.orderCount,
      totalRevenue: aggregate.totalRevenue,
      firstOrderAt: aggregate.firstOrderAt,
      lastOrderAt: aggregate.lastOrderAt,
      typicalInterval: typicalReturnInterval(aggregate.orderDates),
    },
    now,
  );
}

// -------------------------------- reading ----------------------------------

export interface CustomerListQuery {
  segment?: CustomerSegment;
  /** Spending band relative to this venue's own book. */
  valueTier?: ValueTier;
  /** Matches the name or the phone; already trimmed by the schema. */
  search?: string;
  minOrders?: number;
  page?: number;
  pageSize?: number;
}

/** A customer as the list returns one: the derived record plus its value band. */
export interface CustomerListRow extends CustomerRecord {
  valueTier: ValueTier;
}

export interface CustomerListResult {
  customers: CustomerListRow[];
  /** Rows the filter actually matched — the denominator the pager counts from. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * One page of a venue's customers, with their derived metrics.
 *
 * ### Why the filter is applied before the page, not after
 *
 * A segment is a function of recency and order count rather than a stored
 * column, so there is nothing to put in a `WHERE`. This function used to read a
 * page first and filter it afterwards, which kept the query small but made the
 * result wrong in a way an owner could see: asking for "at risk" returned
 * however many of *that page's* twenty-five customers happened to qualify,
 * the count above the table was the unfiltered total, and page two showed a
 * different arbitrary subset. Filtering to four people and calling it "۱۲۰
 * customers" is not a caveat, it is a wrong answer.
 *
 * The book is therefore derived in full and then paged, which is what
 * `getSegmentCounts` has always done one call away — the two now agree by
 * construction instead of by coincidence, and `total` finally means the number
 * of rows the filter actually matched.
 *
 * This is bounded work: it is one venue's own customer book, not the platform's,
 * and two queries regardless of size. A venue with a very large book pays for
 * the aggregate once per request on an owner-only screen, which is the same
 * trade the segment tiles above the table already make.
 */
export async function listCustomers(
  restaurantId: string,
  query: CustomerListQuery,
  now: Date = new Date(),
): Promise<CustomerListResult> {
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(1, query.page ?? 1);

  const where: Prisma.CustomerWhereInput = {
    // From the session, never the request.
    restaurantId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  };

  const rows = await prisma.customer.findMany({
    where,
    // Most recently seen first: an owner opening this screen is looking at
    // who is coming in, not who signed up first.
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, phone: true, name: true, marketingConsent: true },
  });

  const aggregates = await aggregateFor(
    restaurantId,
    rows.map((row) => row.id),
  );

  const derived = rows.map((row) =>
    deriveFrom(row, aggregates.get(row.id) ?? EMPTY, now),
  );

  // The value tier is relative to this venue's own book, so the benchmark comes
  // from every customer in it — not from the page, which would rank a handful of
  // people against each other and call the top two VIPs.
  const threshold = highValueThreshold(derived.map((c) => c.totalRevenue));

  const matched = derived.filter((customer) => {
    if (query.segment && customer.segment !== query.segment) return false;
    if (query.valueTier) {
      if (resolveValueTier(customer, threshold) !== query.valueTier) return false;
    }
    if (query.minOrders !== undefined && customer.orderCount < query.minOrders) {
      return false;
    }
    return true;
  });

  const start = (page - 1) * pageSize;

  return {
    customers: matched.slice(start, start + pageSize).map((customer) => ({
      ...customer,
      valueTier: resolveValueTier(customer, threshold),
    })),
    total: matched.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(matched.length / pageSize)),
  };
}

export type SegmentCounts = Record<CustomerSegment, number> & { total: number };

/**
 * Everything the retention screen shows, from one pass over the book.
 *
 * Segment counts, the summary figures and the opportunity list all read the
 * same derived customers. Computing them separately would mean three passes
 * that could disagree — and "۱۸ at risk" in a tile beside "۱۲ at risk" in an
 * action card is the kind of contradiction that makes an owner stop trusting
 * the screen.
 */
export interface RetentionOverview {
  segments: SegmentCounts;
  summary: RetentionSummary;
  opportunities: RetentionOpportunity[];
  /** Spending at which a customer counts as high value here; null if unknowable. */
  highValueFrom: number | null;
}

/**
 * The venue's retention picture.
 *
 * Two queries — the customer rows and their order totals — then every figure is
 * derived in one pass. At the scale this reports on (a venue's own book, a few
 * thousand rows at most) that is the right shape; it is also the only place
 * that reads them all, and it is behind `requireOwner`.
 */
export async function getRetentionOverview(
  restaurantId: string,
  now: Date = new Date(),
): Promise<RetentionOverview> {
  const rows = await prisma.customer.findMany({
    where: { restaurantId },
    select: { id: true, phone: true, name: true, marketingConsent: true },
  });

  const aggregates = await aggregateFor(
    restaurantId,
    rows.map((row) => row.id),
  );

  const derived = rows.map((row) =>
    deriveFrom(row, aggregates.get(row.id) ?? EMPTY, now),
  );

  const segments = Object.fromEntries(
    CUSTOMER_SEGMENTS.map((segment) => [segment, 0]),
  ) as SegmentCounts;
  segments.total = derived.length;
  for (const customer of derived) segments[customer.segment] += 1;

  const highValueFrom = highValueThreshold(derived.map((c) => c.totalRevenue));

  return {
    segments,
    summary: summariseRetention(derived),
    opportunities: detectOpportunities(
      derived.map((customer) => ({
        segment: customer.segment,
        valueTier: resolveValueTier(customer, highValueFrom),
        orderCount: customer.orderCount,
        totalRevenue: customer.totalRevenue,
        idleDays: customer.daysSinceLastOrder,
      })),
    ),
    highValueFrom,
  };
}

/**
 * How many customers sit in each segment.
 *
 * Now one field of `getRetentionOverview` rather than its own pass over the
 * book. It used to be a second copy of exactly that walk — same two queries,
 * same derivation, counting only the segments — and keeping both would have
 * meant two places that could disagree about how many customers are at risk.
 *
 * Kept as a named function because two callers ask only this question, and
 * `overview.segments` at each of them reads worse than the question itself.
 */
export async function getSegmentCounts(
  restaurantId: string,
  now: Date = new Date(),
): Promise<SegmentCounts> {
  return (await getRetentionOverview(restaurantId, now)).segments;
}

export interface CustomerDetail extends CustomerRecord {
  /** Their spending band relative to this venue's own book. */
  valueTier: ValueTier;
  /**
   * Why they are in the group they are in, with the numbers behind it.
   *
   * Carried so the detail view can state the reasoning — «هر ۱۶ روز سفارش
   * می‌داد، ۳۷ روز است خبری نیست» — rather than printing a label the owner has
   * to take on trust.
   */
  explanation: RetentionExplanation;
  recentOrders: {
    id: string;
    orderNumber: number;
    placedAt: Date;
    status: string;
    total: number;
    /** Which site served it, for a chain. */
    restaurantName: string;
  }[];
}

/**
 * One customer, with the orders behind the numbers.
 *
 * Scoped by `restaurantId` as well as the id, so a guessed id from another
 * venue is a 404 rather than a disclosure — the same rule every other
 * `[id]` read in this codebase follows.
 *
 * Deliberately does not return sessions, payment identifiers, or anything about
 * how the guest was authenticated: there is no guest account, and an owner
 * looking at who their regulars are has no use for security internals.
 */
export async function getCustomer(
  restaurantId: string,
  customerId: string,
  now: Date = new Date(),
): Promise<CustomerDetail | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, restaurantId },
    select: { id: true, phone: true, name: true, marketingConsent: true },
  });

  if (!customer) return null;

  const [aggregates, recentOrders, bookRevenues] = await Promise.all([
    aggregateFor(restaurantId, [customer.id]),
    prisma.order.findMany({
      where: { customerId: customer.id, ...COUNTED },
      orderBy: { placedAt: "desc" },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        placedAt: true,
        status: true,
        total: true,
        restaurant: { select: { name: true } },
      },
    }),
    /*
      What every other customer of this venue has spent.

      Needed because "high value" is relative to the book — there is no amount
      of Toman that means the same thing to a tea house and a steakhouse — so
      one customer's tier cannot be decided from that customer alone. Grouped in
      SQL and returning one integer per customer, not their orders.
    */
    prisma.$queryRaw<{ revenue: bigint | null }[]>`
      SELECT SUM(o."total" - o."tax" - o."tip") AS "revenue"
        FROM "Order" o
        JOIN "Customer" c ON c."id" = o."customerId"
       WHERE c."restaurantId" = ${restaurantId}
         AND ${countedOrderSql("o")}
       GROUP BY o."customerId"
    `,
  ]);

  const record = deriveFrom(customer, aggregates.get(customer.id) ?? EMPTY, now);

  const threshold = highValueThreshold(bookRevenues.map((r) => Number(r.revenue ?? 0)));

  return {
    ...record,
    valueTier: resolveValueTier(record, threshold),
    explanation: explainSegment({
      segment: record.segment,
      orderCount: record.orderCount,
      idleDays: record.daysSinceLastOrder,
      typicalInterval: record.typicalInterval,
    }),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      status: order.status,
      total: order.total,
      restaurantName: order.restaurant.name,
    })),
  };
}

/**
 * Records whether a guest agreed to be contacted.
 *
 * The only writable field on a customer, and the only one that is not derived —
 * everything else this module reports is a fact about orders, which an owner
 * cannot and should not edit. Scoped to the tenant like every other write.
 */
export async function setMarketingConsent(
  restaurantId: string,
  customerId: string,
  consent: boolean,
): Promise<boolean> {
  const result = await prisma.customer.updateMany({
    where: { id: customerId, restaurantId },
    data: { marketingConsent: consent, consentUpdatedAt: new Date() },
  });

  return result.count > 0;
}
