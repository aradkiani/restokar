import "server-only";
import { prisma } from "./prisma";
import { CO_OCCURRENCE_THRESHOLDS, type ProductPairCounts } from "./co-occurrence";

/**
 * Counting which dishes share a bill, and storing the answer.
 *
 * The rules are in `co-occurrence.ts`, which stays pure; this is the scan and
 * the persistence. The split matters more here than elsewhere: the thresholds
 * that decide whether a pair means anything must be applied identically by the
 * guest menu and by the dashboard, and the only way to guarantee that is for
 * neither of them to own the thresholds.
 *
 * ### Why this is stored rather than computed on demand
 *
 * The scan is a self-join over a venue's order lines. On the seed data that is
 * 25,000 lines across 12,500 orders for a handful of venues — fine once, and
 * completely unacceptable on a page that must answer in single-digit
 * milliseconds and is measured at 7 CPU-ms per render. So the menu reads four
 * integers per pair out of an indexed table, and the scan happens on an
 * authenticated dashboard visit, where one extra second is invisible.
 *
 * There is deliberately no scheduler and no background worker: the platform has
 * neither, and adding one to keep a merchandising aggregate warm would be the
 * most expensive possible way to solve this problem.
 */

/**
 * How far back the counting looks.
 *
 * Six months. Long enough that a venue's genuine pairings accumulate evidence,
 * short enough that last winter's menu stops recommending itself in July. A
 * venue that reprices or replaces a dish sees the change work through within
 * two seasons rather than never.
 */
export const CO_OCCURRENCE_WINDOW_DAYS = 180;

/**
 * How stale the aggregate may get before a dashboard visit recomputes it.
 *
 * A day. Co-occurrence moves on the timescale of a menu change, not a lunch
 * service, and recomputing more often would spend a scan to move a decimal.
 */
export const CO_OCCURRENCE_MAX_AGE_HOURS = 24;

/**
 * The most pairs stored for one venue.
 *
 * A 60-dish menu has 3,540 ordered pairs, most of which clear no threshold. The
 * cap is a backstop against a pathological menu rather than an expected limit,
 * and it keeps the menu's `take: 400` read meaningful — storing more rows than
 * the menu will ever read is just slower housekeeping.
 */
const MAX_STORED_PAIRS = 2000;

/** One row as the counting query returns it. */
interface PairRow {
  sourceProductId: string;
  targetProductId: string;
  pairCount: number;
  sourceSupport: number;
  targetSupport: number;
  totalOrders: number;
}

/**
 * Count every qualifying pair for one menu owner.
 *
 * **Scoped by product ownership, not by order ownership**, and that is the
 * chain rule rather than an oversight. Menu content — including suggestions —
 * belongs to the menu owner, while orders belong to the branch that took them.
 * Joining through `Product.restaurantId` therefore gathers every branch's bills
 * for the menu they share, which is what a chain's merchandising should learn
 * from. Scoping by `Order.restaurantId` would instead give each branch its own
 * private statistics about a menu it does not own.
 *
 * One query. The self-join is the whole cost, and `HAVING` discards the long
 * tail inside the database rather than shipping it to Node to be filtered.
 *
 * `DISTINCT` on (order, product) before counting is load-bearing: a guest who
 * orders two burgers on separate lines must count as one bill containing a
 * burger, or a venue selling rounds would show every dish co-occurring with
 * itself several times over.
 */
export async function countPairs(menuOwnerId: string): Promise<PairRow[]> {
  const since = new Date(Date.now() - CO_OCCURRENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$queryRaw<PairRow[]>`
    WITH lines AS (
      SELECT DISTINCT oi."orderId", oi."productId"
      FROM "OrderItem" oi
      JOIN "Product" p ON p.id = oi."productId"
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE p."restaurantId" = ${menuOwnerId}
        AND o.status <> 'CANCELED'
        AND o."placedAt" >= ${since}
    ),
    support AS (
      SELECT "productId", COUNT(*)::int AS n FROM lines GROUP BY "productId"
    ),
    total AS (
      SELECT COUNT(DISTINCT "orderId")::int AS n FROM lines
    )
    SELECT
      a."productId"      AS "sourceProductId",
      b."productId"      AS "targetProductId",
      COUNT(*)::int      AS "pairCount",
      sa.n               AS "sourceSupport",
      sb.n               AS "targetSupport",
      t.n                AS "totalOrders"
    FROM lines a
    JOIN lines b   ON a."orderId" = b."orderId" AND a."productId" <> b."productId"
    JOIN support sa ON sa."productId" = a."productId"
    JOIN support sb ON sb."productId" = b."productId"
    CROSS JOIN total t
    GROUP BY a."productId", b."productId", sa.n, sb.n, t.n
    HAVING COUNT(*) >= ${CO_OCCURRENCE_THRESHOLDS.minPairCount}
    ORDER BY COUNT(*) DESC
    LIMIT ${MAX_STORED_PAIRS}
  `;
}

/**
 * Recount one venue and replace its stored aggregate.
 *
 * Delete-then-insert inside a transaction rather than an upsert per row: the
 * result is a complete restatement, a pair that stopped qualifying has to
 * disappear, and one `deleteMany` plus one `createMany` is two statements where
 * upserting would be one per pair.
 *
 * Returns how many pairs were stored, which is what the dashboard reports and
 * what makes "nothing qualified yet" distinguishable from "never ran".
 */
export async function refreshPairStats(menuOwnerId: string): Promise<number> {
  const rows = await countPairs(menuOwnerId);
  const computedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.productPairStat.deleteMany({ where: { restaurantId: menuOwnerId } });

    if (rows.length === 0) return;

    await tx.productPairStat.createMany({
      data: rows.map((row) => ({
        // From the resolved menu owner, never from a request body.
        restaurantId: menuOwnerId,
        sourceProductId: row.sourceProductId,
        targetProductId: row.targetProductId,
        pairCount: row.pairCount,
        sourceSupport: row.sourceSupport,
        targetSupport: row.targetSupport,
        totalOrders: row.totalOrders,
        computedAt,
      })),
    });
  });

  return rows.length;
}

/**
 * When this venue's aggregate was last counted, or null if it never was.
 *
 * Reads the newest row rather than keeping a separate marker, for the same
 * reason `/api/health` reads the backup directory rather than the settings row:
 * a marker can disagree with the data it describes, and when it does it is
 * always the marker that is wrong.
 */
export async function pairStatsComputedAt(menuOwnerId: string): Promise<Date | null> {
  const newest = await prisma.productPairStat.findFirst({
    where: { restaurantId: menuOwnerId },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });

  return newest?.computedAt ?? null;
}

/**
 * Recount only if the stored answer is old enough to be worth replacing.
 *
 * The lazy refresh the whole design rests on. Called from the owner's
 * merchandising screen — an authenticated, low-frequency, already-slow-enough
 * page — so the guest menu never pays for the scan.
 *
 * A failure here is swallowed deliberately. Stale merchandising statistics are
 * a far smaller problem than a dashboard that will not load, and the previous
 * numbers remain correct as of when they were taken. The caller shows the age,
 * so nothing is silently presented as fresher than it is.
 */
export async function refreshPairStatsIfStale(menuOwnerId: string): Promise<Date | null> {
  const computedAt = await pairStatsComputedAt(menuOwnerId);

  const ageMs = computedAt ? Date.now() - computedAt.getTime() : Infinity;
  if (ageMs < CO_OCCURRENCE_MAX_AGE_HOURS * 60 * 60 * 1000) return computedAt;

  try {
    await refreshPairStats(menuOwnerId);
    return pairStatsComputedAt(menuOwnerId);
  } catch {
    return computedAt;
  }
}

/**
 * The stored aggregate for one venue, as the pure module wants it.
 *
 * Returns raw counts and applies no threshold — ranking is
 * `rankCoOccurrence`'s job, and doing any of it here would be the second
 * opinion this module exists to avoid.
 */
export async function getPairStats(menuOwnerId: string): Promise<ProductPairCounts[]> {
  return prisma.productPairStat.findMany({
    where: { restaurantId: menuOwnerId },
    orderBy: [{ pairCount: "desc" }, { sourceProductId: "asc" }],
    select: {
      sourceProductId: true,
      targetProductId: true,
      pairCount: true,
      sourceSupport: true,
      targetSupport: true,
      totalOrders: true,
    },
  });
}
