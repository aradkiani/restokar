import "server-only";
import { prisma } from "./prisma";
import {
  dayKey,
  getCategoryBreakdown,
  getProductSales,
  getRangeSummary,
  getTopProducts,
  type DateRange,
} from "./analytics";
import { businessNow } from "./business-day-server";
import {
  assessCostCoverage,
  menuConcentration,
  rankPerformance,
  type MenuBenchmark,
  type ProductPerformance,
} from "./profitability";
import { getFeaturedPerformance } from "./featured-server";
import { getRecommendationPerformance } from "./recommendations-server";
import { countedOrderSql } from "./order-status";
import {
  resolveComparison,
  type ComparisonPreset,
  type ComparisonWindows,
} from "./insight-periods";
import {
  buildSalesInsights,
  type CustomerActivity,
  type EntityTotals,
  type MerchandisingSurface,
  type SalesInsightReport,
} from "./sales-insights";

/**
 * Gathers what the insight engine needs and hands it over.
 *
 * Every figure comes from `analytics.ts` — `getRangeSummary`, `getTopProducts`
 * and `getCategoryBreakdown` — so revenue is `total − tax − tip`, a valid order
 * is one that was not cancelled, and the average ticket is the rounded division
 * those functions already perform. **No definition is restated here.** If the
 * platform ever changes what revenue means, this follows automatically.
 *
 * Tenant scoping is the same as everywhere else: `restaurantId` arrives from
 * the session and is passed straight into queries that all filter on it. There
 * is no code path here that can read another venue's orders.
 *
 * Query shape: two range summaries, two order-item reads (each shared between
 * the product and category calls by the `cache()` memo in `analytics.ts`), one
 * grouped customer query per window, and the two merchandising reports. Nothing
 * is per-product, and nothing loads an order list into application memory
 * beyond what the existing analytics layer already does.
 */

export interface SalesInsightResult extends SalesInsightReport {
  windows: ComparisonWindows;
  /** The classified menu the profitability insights were drawn from. */
  profitability: {
    products: ProductPerformance[];
    benchmark: MenuBenchmark;
  };
}

/** `getTopProducts` groups deleted products under their snapshot name; mirror that key. */
function productKey(row: { productId: string | null; name: string }): string {
  return row.productId ?? `deleted:${row.name}`;
}

/**
 * How many of a window's orders came from guests the venue had already served.
 *
 * "Returning" means the guest's first non-cancelled order at this venue falls
 * *before* the window — so the same order is classified the same way however
 * often the report is run, which is what makes the figure reproducible.
 *
 * Two grouped scans rather than a lookup per order: one for the window's orders
 * by customer, one for those customers' first order date. Both are covered by
 * the existing `Order(customerId, status)` and `Order(restaurantId, status)`
 * indexes.
 *
 * Scoped to `restaurantId` on both halves. For a chain branch that means
 * "returning to this site", which is what the rest of this venue's analytics
 * measures, and it keeps the query provably inside one tenant.
 *
 * Orders with no `customerId` — the common case, since giving a phone number
 * has never been required — are excluded rather than guessed at. When too few
 * orders carry one, the engine's own floor suppresses the insight.
 */
async function getCustomerActivity(
  restaurantId: string,
  range: DateRange,
): Promise<CustomerActivity> {
  // Business dates as plain `YYYY-MM-DD` text, cast to date in SQL.
  const from = dayKey(range.from);
  const to = dayKey(range.to);
  const rows = await prisma.$queryRaw<{ identified: number; returning: number }[]>`
    WITH period AS (
      SELECT o."customerId", COUNT(*)::int AS orders
        FROM "Order" o
       WHERE o."restaurantId" = ${restaurantId}
         AND ${countedOrderSql("o")}
         AND o."customerId" IS NOT NULL
         AND o."businessDate" >= ${from}::date
         AND o."businessDate" <= ${to}::date
       GROUP BY o."customerId"
    ),
    firsts AS (
      SELECT o."customerId", MIN(o."businessDate") AS first_at
        FROM "Order" o
       WHERE o."restaurantId" = ${restaurantId}
         AND ${countedOrderSql("o")}
         AND o."customerId" IN (SELECT "customerId" FROM period)
       GROUP BY o."customerId"
    )
    SELECT COALESCE(SUM(p.orders), 0)::int AS identified,
           COALESCE(SUM(p.orders) FILTER (WHERE f.first_at < ${from}::date), 0)::int
             AS returning
      FROM period p
      JOIN firsts f ON f."customerId" = p."customerId"
  `;

  const identifiedOrders = rows[0]?.identified ?? 0;
  const returningCustomerOrders = rows[0]?.returning ?? 0;

  return {
    identifiedOrders,
    returningCustomerOrders,
    newCustomerOrders: identifiedOrders - returningCustomerOrders,
  };
}

/**
 * Every product that sold in a window, not just the leaderboard.
 *
 * The contributor rules divide one dish's movement by the total movement, so a
 * truncated list would produce a share of the wrong denominator. The cap is a
 * safety bound, not a ranking — `getProductProfitability` already reads the
 * catalogue this way.
 */
const ALL_PRODUCTS = 1000;

async function entitiesFor(
  restaurantId: string,
  range: DateRange,
): Promise<{ products: EntityTotals[]; categories: EntityTotals[] }> {
  const [products, categories] = await Promise.all([
    getTopProducts(restaurantId, range, ALL_PRODUCTS),
    getCategoryBreakdown(restaurantId, range),
  ]);

  return {
    products: products.map((row) => ({
      key: productKey(row),
      id: row.productId,
      name: row.name,
      revenue: row.revenue,
      quantity: row.quantity,
    })),
    categories: categories.map((row) => ({
      key: row.categoryId,
      id: row.categoryId,
      name: row.name,
      revenue: row.revenue,
      quantity: row.quantity,
    })),
  };
}

/**
 * Merchandising figures, reused rather than recomputed.
 *
 * `getFeaturedPerformance` and `getRecommendationPerformance` already own the
 * event counting and the conversion definition; this only reshapes their rows.
 * A venue that has never promoted anything gets empty arrays, and the engine
 * simply has nothing to say about them.
 */
function surfaceOf(
  row: { impressions: number; addedToCart: number; purchases: number },
  key: string,
  name: string,
): MerchandisingSurface {
  return {
    key,
    name,
    impressions: row.impressions,
    addedToCart: row.addedToCart,
    purchases: row.purchases,
  };
}

export async function getSalesInsights(
  restaurantId: string,
  preset: ComparisonPreset,
  now: Date = new Date(),
): Promise<SalesInsightResult> {
  // Calendar presets read from the site's business date: at 01:00 in a café
  // open until 03:00, "today" is still this evening.
  const windows = resolveComparison(preset, await businessNow(restaurantId, now));

  /*
    Merchandising telemetry is filed against the menu owner while the attributed
    order lines belong to the venue that served them, so at a branch the two
    halves count different populations. Rather than feed the engine a surface
    with real purchases and zero impressions — which would read as a catastrophic
    conversion rate — a branch contributes no merchandising input at all. It also
    saves two queries the branch could never use.
  */
  const venue = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  const ownsItsMenu = !venue?.parentRestaurantId;

  const [
    currentSummary,
    previousSummary,
    currentEntities,
    previousEntities,
    currentCustomers,
    previousCustomers,
    featured,
    recommendations,
    productSales,
  ] = await Promise.all([
    getRangeSummary(restaurantId, windows.current),
    getRangeSummary(restaurantId, windows.previous),
    entitiesFor(restaurantId, windows.current),
    entitiesFor(restaurantId, windows.previous),
    getCustomerActivity(restaurantId, windows.current),
    getCustomerActivity(restaurantId, windows.previous),
    ownsItsMenu
      ? getFeaturedPerformance(restaurantId, windows.current)
      : Promise.resolve([]),
    ownsItsMenu
      ? getRecommendationPerformance(restaurantId, windows.current)
      : Promise.resolve([]),
    /*
      Realised per-dish economics for the current window.

      Reads the same request-cached order items `entitiesFor` already loaded, so
      it adds no query. Only the current window: margin is a statement about how
      the menu earns *now*, and comparing it against a previous period would be a
      different insight needing its own thresholds.
    */
    getProductSales(restaurantId, windows.current),
  ]);

  /*
    Placement happens here, once, and the result is shared.

    The same classified rows feed the insight engine below and the analytics
    table on screen, so a dish the table shows as "review pricing" is exactly the
    dish the insight names. Deriving them twice is how those two come to
    disagree.
  */
  const { rows: profitabilityRows, benchmark } = rankPerformance(productSales);

  const report = buildSalesInsights({
    current: { revenue: currentSummary.revenue, orders: currentSummary.orders },
    previous: { revenue: previousSummary.revenue, orders: previousSummary.orders },
    products: { current: currentEntities.products, previous: previousEntities.products },
    categories: {
      current: currentEntities.categories,
      previous: previousEntities.categories,
    },
    customers: { current: currentCustomers, previous: previousCustomers },
    featured: featured.map((row) => surfaceOf(row, row.productId, row.productName)),
    recommendations: recommendations.map((row) =>
      surfaceOf(
        row,
        `${row.sourceProductId}:${row.recommendedProductId}`,
        row.recommendedName,
      ),
    ),
    profitability: {
      products: profitabilityRows,
      benchmark,
      coverage: assessCostCoverage(productSales),
      concentration: menuConcentration(productSales),
    },
  });

  return {
    ...report,
    windows,
    // Carried out so the analytics page can render the same classified rows the
    // insights were drawn from, rather than asking for them a second time.
    profitability: { products: profitabilityRows, benchmark },
  };
}
