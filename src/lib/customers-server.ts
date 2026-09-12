import "server-only";
import { prisma } from "./prisma";
import { normalisePhone } from "./phone";
import {
  CUSTOMER_SEGMENTS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  deriveCustomer,
  type CustomerRecord,
  type CustomerSegment,
} from "./customers";
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
const COUNTED = { status: { not: "CANCELED" } } as const satisfies Prisma.OrderWhereInput;

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
}

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
    }[]
  >`
    SELECT o."customerId",
           COUNT(*)                                   AS "orderCount",
           SUM(o."total" - o."tax" - o."tip")         AS "totalRevenue",
           MIN(o."placedAt")                          AS "firstOrderAt",
           MAX(o."placedAt")                          AS "lastOrderAt"
      FROM "Order" o
      JOIN "Customer" c ON c."id" = o."customerId"
     WHERE o."customerId" = ANY(${customerIds as string[]})
       AND o."status" <> 'CANCELED'
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
      },
    ]),
  );
}

const EMPTY: Aggregate = {
  orderCount: 0,
  totalRevenue: 0,
  firstOrderAt: null,
  lastOrderAt: null,
};

// -------------------------------- reading ----------------------------------

export interface CustomerListQuery {
  segment?: CustomerSegment;
  /** Matches the name or the phone; already trimmed by the schema. */
  search?: string;
  minOrders?: number;
  page?: number;
  pageSize?: number;
}

export interface CustomerListResult {
  customers: CustomerRecord[];
  /** Rows matching the query before segment filtering and paging. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * One page of a venue's customers, with their derived metrics.
 *
 * Segment is filtered *after* aggregation because it is a function of recency
 * and order count rather than a stored column — there is nothing to put in a
 * `WHERE`. Rather than aggregate the whole book to filter it, the page is read
 * first and the segment applied to it, which keeps the query bounded; the
 * consequence is that a segment-filtered page can be shorter than its page
 * size, and the count above it is the unfiltered total. Stated plainly in the
 * UI rather than papered over.
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

  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      // Most recently seen first: an owner opening this screen is looking at
      // who is coming in, not who signed up first.
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        phone: true,
        name: true,
        marketingConsent: true,
      },
    }),
  ]);

  const aggregates = await aggregateFor(
    restaurantId,
    rows.map((row) => row.id),
  );

  let customers = rows.map((row) =>
    deriveCustomer({ ...row, ...(aggregates.get(row.id) ?? EMPTY) }, now),
  );

  if (query.segment) {
    customers = customers.filter((customer) => customer.segment === query.segment);
  }
  if (query.minOrders !== undefined) {
    customers = customers.filter((customer) => customer.orderCount >= query.minOrders!);
  }

  return {
    customers,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type SegmentCounts = Record<CustomerSegment, number> & { total: number };

/**
 * How many customers sit in each segment.
 *
 * Aggregates every customer of the venue in two queries — one for the ids, one
 * for their order totals — then applies the segment rules in JS, because they
 * depend on "days since" which no index can answer. At the scale this reports
 * on (a venue's own customer book, not the platform's) that is a few thousand
 * rows at most, and it is the only place that reads them all.
 */
export async function getSegmentCounts(
  restaurantId: string,
  now: Date = new Date(),
): Promise<SegmentCounts> {
  const rows = await prisma.customer.findMany({
    where: { restaurantId },
    select: { id: true, phone: true, name: true, marketingConsent: true },
  });

  const aggregates = await aggregateFor(
    restaurantId,
    rows.map((row) => row.id),
  );

  const counts = Object.fromEntries(
    CUSTOMER_SEGMENTS.map((segment) => [segment, 0]),
  ) as SegmentCounts;
  counts.total = rows.length;

  for (const row of rows) {
    const derived = deriveCustomer({ ...row, ...(aggregates.get(row.id) ?? EMPTY) }, now);
    counts[derived.segment] += 1;
  }

  return counts;
}

export interface CustomerDetail extends CustomerRecord {
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

  const [aggregates, recentOrders] = await Promise.all([
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
  ]);

  return {
    ...deriveCustomer({ ...customer, ...(aggregates.get(customer.id) ?? EMPTY) }, now),
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
