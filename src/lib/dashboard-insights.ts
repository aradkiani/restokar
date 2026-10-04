import "server-only";
import { prisma } from "./prisma";
import { netRevenue, startOfDay } from "./analytics";
import { zonedParts } from "./time";
import { DAY_MS, staffCallVisibleSince } from "./constants";
import { COUNTED_ORDER } from "./order-status";

/**
 * The overview page answers "how is today going?". A bare figure cannot answer
 * that — 4,200,000 Toman is a good Tuesday and a poor Friday — so everything
 * here exists to give a number something to be compared against, or to point at
 * something the owner can actually go and fix.
 */

/** Orders that count toward takings. See `order-status.ts` for why. */
const COUNTED = COUNTED_ORDER;

export interface Comparison {
  current: number;
  previous: number;
  /** Rounded whole percent. Null when there is no baseline to compare against. */
  deltaPercent: number | null;
}

/**
 * Percentage change, with the two cases that a naive division gets wrong.
 *
 * Growth from zero is not "infinite percent" — it is simply new, and the UI
 * says so rather than printing ∞. Zero-to-zero is flat, not undefined.
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Today against the *same weekday* last week, not against yesterday.
 *
 * Restaurant trade is weekly, not daily: Thursday is busy and Monday is not, so
 * comparing Thursday with Wednesday reports a boom every week and a slump every
 * Saturday. Comparing like weekday with like weekday is the only version of
 * this number an owner can act on.
 */
export async function getTodayComparison(restaurantId: string): Promise<{
  revenue: Comparison;
  orders: Comparison;
}> {
  const todayStart = startOfDay(new Date());
  const now = new Date();

  // The same slice of the day a week ago, so a comparison made at 11am is
  // against last week's 11am rather than against its whole day.
  const lastWeekStart = new Date(todayStart.getTime() - 7 * DAY_MS);
  const lastWeekCutoff = new Date(now.getTime() - 7 * DAY_MS);

  const [today, lastWeek] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, ...COUNTED, placedAt: { gte: todayStart } },
      _sum: { total: true, tax: true, tip: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: {
        restaurantId,
        ...COUNTED,
        placedAt: { gte: lastWeekStart, lte: lastWeekCutoff },
      },
      _sum: { total: true, tax: true, tip: true },
      _count: true,
    }),
  ]);

  const revenueOf = (a: typeof today) =>
    netRevenue({
      total: a._sum.total ?? 0,
      tax: a._sum.tax ?? 0,
      tip: a._sum.tip ?? 0,
    });

  const currentRevenue = revenueOf(today);
  const previousRevenue = revenueOf(lastWeek);

  return {
    revenue: {
      current: currentRevenue,
      previous: previousRevenue,
      deltaPercent: percentDelta(currentRevenue, previousRevenue),
    },
    orders: {
      current: today._count,
      previous: lastWeek._count,
      deltaPercent: percentDelta(today._count, lastWeek._count),
    },
  };
}

export interface MenuHealth {
  total: number;
  /**
   * Null when the venue has switched product photos off, which is a different
   * state from "every product has one" and must not render as a satisfied row.
   * A venue running a text-only menu has no photo gap to close, so the measure
   * does not apply rather than being met.
   */
  missingImage: number | null;
  missingDescription: number;
  /** Cost of goods left at zero, which silently reports 100% margin. */
  missingCost: number;
  /** Currently marked unavailable — a reminder to switch them back on. */
  unavailable: number;
}

/**
 * Gaps in the menu data that cost the owner money or credibility.
 *
 * `missingCost` is the one that matters most and is the least obvious: a
 * product with costPrice 0 reports a 100% margin, so the profit figures on the
 * finance page look excellent for exactly the products nobody has costed.
 */
export async function getMenuHealth(restaurantId: string): Promise<MenuHealth> {
  const [restaurant, total, missingImage, missingDescription, missingCost, unavailable] =
    await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { showProductPhotos: true },
      }),
      prisma.product.count({ where: { restaurantId } }),
      prisma.product.count({
        where: { restaurantId, OR: [{ imageUrl: null }, { imageUrl: "" }] },
      }),
      prisma.product.count({
        where: {
          restaurantId,
          OR: [{ shortDescription: null }, { shortDescription: "" }],
        },
      }),
      prisma.product.count({ where: { restaurantId, costPrice: { lte: 0 } } }),
      prisma.product.count({ where: { restaurantId, isAvailable: false } }),
    ]);

  return {
    total,
    // Counted unconditionally and discarded when it does not apply: one indexed
    // COUNT is cheaper than the extra round trip that reading the flag first
    // would cost, and this keeps the whole health check to a single batch.
    missingImage: restaurant?.showProductPhotos === false ? null : missingImage,
    missingDescription,
    missingCost,
    unavailable,
  };
}

/**
 * Guest requests still waiting for someone to answer them.
 *
 * Surfaced on the overview because it is the only figure here that is urgent:
 * every other number describes the past, while this one is a person at a table
 * with their hand up right now.
 */
export async function getPendingStaffCalls(restaurantId: string): Promise<
  {
    id: string;
    tableNumber: string;
    note: string | null;
    kind: "CALL" | "BILL";
    createdAt: Date;
  }[]
> {
  return prisma.staffCall.findMany({
    where: {
      restaurantId,
      acknowledgedAt: null,
      createdAt: { gte: staffCallVisibleSince() },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, tableNumber: true, note: true, kind: true, createdAt: true },
  });
}

/**
 * The busiest trading hours over the last four weeks.
 *
 * Four weeks rather than one so a single unusual night does not decide the
 * rota, and returned as a ranked shortlist because "when should I put another
 * person on?" is a question about the top few hours, not a 24-bar chart.
 */
export async function getPeakHours(
  restaurantId: string,
  take = 3,
): Promise<{ hour: number; orders: number; share: number }[]> {
  const from = new Date(startOfDay(new Date()).getTime() - 28 * DAY_MS);

  const orders = await prisma.order.findMany({
    where: { restaurantId, ...COUNTED, placedAt: { gte: from } },
    select: { placedAt: true },
  });

  if (orders.length === 0) return [];

  const hours = new Array<number>(24).fill(0);
  // Read in the venue's zone, matching `getHourlyDistribution`. On a host left
  // at UTC `getHours()` reports the rota 3½ hours early.
  for (const order of orders) hours[zonedParts(order.placedAt).hour]! += 1;

  return hours
    .map((count, hour) => ({
      hour,
      orders: count,
      share: count / orders.length,
    }))
    .filter((h) => h.orders > 0)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, take);
}
