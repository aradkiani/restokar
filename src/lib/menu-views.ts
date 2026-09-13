import "server-only";
import { prisma } from "./prisma";
import { startOfDayInZone } from "./time";

/**
 * Counting how often a venue's menu is opened.
 *
 * Stored as one row per restaurant per trading day and incremented in place,
 * rather than a row per view. The question is only ever asked per day, and a
 * log would be the largest table in the database inside a month.
 *
 * **Nothing enforces `Plan.maxDailyViews` from this.** The figure exists so the
 * ceiling on the pricing page can eventually mean something, but what should
 * happen at the cap — refuse the menu, warn the owner, bill for the overage —
 * is a product decision, and inventing one silently is how a restaurant's menu
 * goes dark at dinner service without anyone having chosen that.
 */

/**
 * Records one menu open.
 *
 * The day is midnight in the venue's zone, never the host's: a server running
 * UTC would otherwise cut a Tehran evening in half and file the same service
 * under two dates.
 *
 * The upsert leans on the unique index on `(restaurantId, day)`. Two requests
 * arriving together both try to create, one loses on the constraint, and its
 * update increments the row the winner made — which is why the increment is
 * `{ increment: 1 }` rather than a read followed by a write. A lost race here
 * would be a silently undercounted day.
 *
 * Failures are swallowed by the caller, not here: this is telemetry on the hot
 * path of a public menu, and a guest's dinner does not depend on it arriving.
 */
export async function recordMenuView(restaurantId: string, at: Date = new Date()) {
  const day = startOfDayInZone(at);

  await prisma.menuDailyView.upsert({
    where: { restaurantId_day: { restaurantId, day } },
    create: { restaurantId, day, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export interface DailyViewRow {
  /** Midnight of the trading day, in the venue's zone. */
  day: Date;
  count: number;
}

/**
 * A venue's daily view counts, newest first.
 *
 * Days with no views are absent rather than zero — the table only holds days
 * that happened. A caller drawing a chart fills the gaps, because only it knows
 * which range it means to show.
 */
export async function dailyViews(
  restaurantId: string,
  days = 30,
): Promise<DailyViewRow[]> {
  const since = startOfDayInZone(new Date(), -(days - 1));

  const rows = await prisma.menuDailyView.findMany({
    where: { restaurantId, day: { gte: since } },
    orderBy: { day: "desc" },
    select: { day: true, count: true },
  });

  return rows;
}

/** Today's count for a venue, or zero before the first open of the day. */
export async function viewsToday(restaurantId: string): Promise<number> {
  const row = await prisma.menuDailyView.findUnique({
    where: { restaurantId_day: { restaurantId, day: startOfDayInZone(new Date()) } },
    select: { count: true },
  });

  return row?.count ?? 0;
}
