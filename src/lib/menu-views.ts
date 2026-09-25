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
 * "This open did not come through a table's QR code."
 *
 * The stored form, not a display value — nothing renders it. Exported so the
 * recorder, the readers and their tests all name the same thing rather than
 * three of them spelling `""` and hoping they agree.
 */
export const NO_TABLE = "";

/**
 * The longest table number that will be filed against a row.
 *
 * Matches `CreateOrderInput.tableNumber` in orders.ts, deliberately: the two
 * columns are joined on, so a value one of them would truncate and the other
 * would keep is a pair that silently stops matching. Anything longer is
 * recorded as untabled rather than trusted.
 */
const MAX_TABLE_NUMBER = 20;

/**
 * What gets stored for a table number a guest's link supplied.
 *
 * The public beacon is the only caller, so this is untrusted input reaching a
 * column that a later query groups by. Trimmed, bounded, and anything outside
 * those bounds collapsed to `NO_TABLE` — the row still counts the open, it just
 * does not attribute it to a table it cannot vouch for.
 */
export function normaliseViewTable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.length > MAX_TABLE_NUMBER) return NO_TABLE;
  return trimmed;
}

/**
 * Records one menu open, against a table when the link named one.
 *
 * The day is midnight in the venue's zone, never the host's: a server running
 * UTC would otherwise cut a Tehran evening in half and file the same service
 * under two dates.
 *
 * The upsert leans on the unique index on `(restaurantId, day, tableNumber)`.
 * Two requests arriving together both try to create, one loses on the
 * constraint, and its update increments the row the winner made — which is why
 * the increment is `{ increment: 1 }` rather than a read followed by a write. A
 * lost race here would be a silently undercounted day.
 *
 * Still one upsert per open. The table widened the grain rather than adding a
 * second write, because this sits on the hot path of a public menu and the
 * cheapest analytics is the kind that does not cost a second round trip.
 *
 * Failures are swallowed by the caller, not here: this is telemetry on the hot
 * path of a public menu, and a guest's dinner does not depend on it arriving.
 */
export async function recordMenuView(
  restaurantId: string,
  options: { tableNumber?: string | null; at?: Date } = {},
) {
  const day = startOfDayInZone(options.at ?? new Date());
  const tableNumber = normaliseViewTable(options.tableNumber);

  await prisma.menuDailyView.upsert({
    where: { restaurantId_day_tableNumber: { restaurantId, day, tableNumber } },
    create: { restaurantId, day, tableNumber, count: 1 },
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
 *
 * Sums across the day's rows since the grain gained a table: a venue that took
 * opens at four tables has four rows for that date, and the figure this has
 * always returned is their total. Grouped in the database rather than in JS so
 * the page still reads one row per day however many tables a venue has.
 */
export async function dailyViews(
  restaurantId: string,
  days = 30,
): Promise<DailyViewRow[]> {
  const since = startOfDayInZone(new Date(), -(days - 1));

  const rows = await prisma.menuDailyView.groupBy({
    by: ["day"],
    where: { restaurantId, day: { gte: since } },
    _sum: { count: true },
    orderBy: { day: "desc" },
  });

  return rows.map((row) => ({ day: row.day, count: row._sum.count ?? 0 }));
}

/**
 * Today's count for a venue, or zero before the first open of the day.
 *
 * The venue's whole total, tabled and untabled alike — the same number this
 * returned when a day was a single row, which is what the capacity ceiling on
 * the subscription page is written against.
 */
export async function viewsToday(restaurantId: string): Promise<number> {
  const total = await prisma.menuDailyView.aggregate({
    where: { restaurantId, day: startOfDayInZone(new Date()) },
    _sum: { count: true },
  });

  return total._sum.count ?? 0;
}

/** One table's menu opens across a window. */
export interface TableViewRow {
  /** As the link supplied it. `NO_TABLE` for opens that named no table. */
  tableNumber: string;
  views: number;
}

/**
 * Menu opens per table across a window, for the table intelligence report.
 *
 * Lives here rather than in `tables-server.ts` because this module owns
 * MenuDailyView, and one owner per table is what stops two callers disagreeing
 * about what a row means.
 *
 * Returns untabled opens under `NO_TABLE` as well, rather than dropping them:
 * the report needs to say what share of a venue's traffic it could attribute at
 * all, and a caller that silently discarded the remainder would show a venue
 * with a direct link in its Instagram bio a conversion rate built on a fraction
 * of its real traffic.
 *
 * Grouped in the database, over the `(restaurantId, day, tableNumber)` index
 * the unique constraint already provides.
 */
export async function tableViews(
  restaurantId: string,
  range: { from: Date; to: Date },
): Promise<TableViewRow[]> {
  const rows = await prisma.menuDailyView.groupBy({
    by: ["tableNumber"],
    where: { restaurantId, day: { gte: range.from, lte: range.to } },
    _sum: { count: true },
  });

  return rows.map((row) => ({
    tableNumber: row.tableNumber,
    views: row._sum.count ?? 0,
  }));
}
