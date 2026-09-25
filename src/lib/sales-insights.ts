import { merchandisingRatio } from "./merchandising";
import type {
  CostCoverage,
  MenuBenchmark,
  MenuConcentration,
  ProductPerformance,
} from "./profitability";
import { TABLE_THRESHOLDS, type TableConcentration, type TableReport } from "./tables";

/**
 * Why the numbers moved, stated as rules rather than as a model.
 *
 * Deterministic and explainable end to end: every insight is a comparison of
 * two figures the reporting layer already produces, and the same input always
 * yields the same output. **No inference, no forecasting, no learning** — a
 * restaurant owner has to be able to check the arithmetic, and a number they
 * cannot check is a number they cannot act on.
 *
 * Free of database and framework imports, like `pricing.ts` and `customers.ts`.
 * The gathering lives in `sales-insights-server.ts`, which feeds this the
 * aggregates that `analytics.ts` already defines — there is no second
 * definition of revenue, of a valid order, or of an average ticket anywhere in
 * this file.
 *
 * ### What this deliberately does not do
 *
 * It never claims a cause. Revenue and order volume moving together is an
 * association, and the copy keys say so; the engine reports *what* changed and
 * *which part of the arithmetic it sits in*, and stops there. "Sales fell
 * because guests dislike the burger" is not a statement this data can support,
 * so no rule here can emit it.
 */

// ------------------------------- thresholds --------------------------------

/**
 * The floors below which a movement is not worth an owner's attention.
 *
 * Chosen against the scale this product actually runs at: a subscribed venue is
 * a 10–50 table restaurant on a 599,000–1,290,000 Toman plan, taking on the
 * order of 20–60 covers a day at roughly 150,000–600,000 Toman a ticket. Over a
 * 30-day window that is several hundred orders and a few hundred million Toman.
 *
 * Every rule reads these. Nothing here is repeated at a call site, so retuning
 * the sensitivity of the whole feature is one edit.
 */
export const INSIGHT_THRESHOLDS = {
  /** 8% — smaller swings are ordinary week-to-week variation in this trade. */
  minPercentChange: 0.08,

  /**
   * 500,000 Toman — one to three average tickets. Below this a large percentage
   * is arithmetic on a small base, not a change in the business.
   */
  minRevenueDelta: 500_000,

  /**
   * A baseline of fewer than 10 orders cannot support a percentage. Ten is
   * roughly a slow half-day for the smallest venue on the smallest plan.
   */
  minOrdersPerPeriod: 10,

  /** Below 30 orders either side, a real finding is still reported — quietly. */
  lowConfidenceOrders: 30,

  /** Four orders either way is a rota change, not a trend. */
  minOrderDelta: 5,

  /** 10,000 Toman on a ~300,000 Toman ticket. */
  minAovDelta: 10_000,

  /** A dish needs to have actually sold before its movement means anything. */
  minProductRevenue: 300_000,
  minProductQuantity: 5,
  /** 2,000,000 Toman — the point at which one dish is worth naming on its own. */
  minProductRevenueDelta: 2_000_000,

  minCategoryRevenue: 500_000,
  minCategoryRevenueDelta: 2_000_000,

  /** Orders carrying an identified guest, below which the mix is guesswork. */
  minIdentifiedOrders: 10,
  minReturningOrderDelta: 5,

  /** A promoted dish shown fewer times than this has not been tested. */
  minImpressions: 30,
  /** Under 2% of sightings converting is worth a look, not an alarm. */
  weakConversionRate: 0.02,

  /**
   * Share of the revenue movement one side of the arithmetic must carry before
   * it is named as the dominant one. Below it, both moved and the insight says
   * so rather than picking a winner.
   */
  driverShare: 0.6,
} as const;

// --------------------------------- types -----------------------------------

export type InsightType =
  | "revenueChange"
  | "revenueDriver"
  | "orderVolumeChange"
  | "aovChange"
  | "topNegativeContributor"
  | "topPositiveContributor"
  | "categoryDecline"
  | "categoryGrowth"
  | "customerMixChange"
  | "featuredWeakConversion"
  | "recommendationWeakConversion"
  /*
    Profitability, added as rules inside this engine rather than as a second one.

    This module already owns severity, confidence, scoring, ranking and the
    message-key contract; a separate "profit insight engine" would have had to
    reproduce all of it, and the two would then have competed for the same space
    on the same page with no shared idea of which finding mattered more. The
    arithmetic they rank lives in `profitability.ts`; the judgement about whether
    it is worth an owner's attention stays here, with every other such judgement.
  */
  /** Sells well, earns little — the commercially important one. */
  | "highSalesLowMargin"
  /** Earns well, barely sells. Points at the existing merchandising tools. */
  | "lowSalesHighMargin"
  /** Too much of the period's revenue had no cost behind it to trust a margin. */
  | "costDataIncomplete"
  /** A large share of revenue resting on very few dishes. */
  | "menuConcentration"
  /*
    Table intelligence, added as rules inside this engine rather than as a third
    one, on exactly the reasoning recorded above for profitability.

    They are reached through `buildTableInsights` rather than through
    `buildSalesInsights`, because they answer a question asked on a different
    screen and about a different axis — the room, not the menu. Same
    `SalesInsight` shape, same severities, same `scoreOf`, same `rank`, same
    message-key contract, so the table page renders them with the analytics
    page's own `InsightCard` and nothing about "what an insight is" is
    duplicated.
  */
  /** A table carrying much more of the room's trade than an even one would. */
  | "tableHighActivity"
  /** A table that has gone quieter against the comparison window. */
  | "tableActivityDecline"
  /** Its code is opened often, and comparatively few orders follow. */
  | "tableViewsWithoutOrders"
  /** A large share of the room's takings resting on very few tables. */
  | "tableConcentration";

export type InsightSeverity = "critical" | "warning" | "positive" | "neutral";
export type InsightDirection = "up" | "down" | "flat";
export type InsightConfidence = "high" | "low";
export type RevenueDriver = "orders" | "averageOrderValue" | "both" | "none";

export interface InsightEntity {
  kind: "product" | "category" | "table";
  /**
   * Null for a product that has since been deleted, or for a table number that
   * orders name but no `RestaurantTable` row does.
   */
  id: string | null;
  name: string;
}

export interface SalesInsight {
  /** Stable across runs on the same data, so React keys do not thrash. */
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  direction: InsightDirection;
  /** Key into `t.insights.messages`. The engine never emits a sentence. */
  messageKey: string;
  /** Raw numbers for interpolation. Formatting is the UI's job, not this one's. */
  values: Record<string, number>;
  metric: number;
  comparison: number;
  deltaAbsolute: number;
  /** A fraction, matching what `formatPercent` expects. Null with no baseline. */
  deltaPercent: number | null;
  entity?: InsightEntity;
  /** Key into `t.insights.actions`. A suggestion for the owner, never an action. */
  actionKey?: string;
  confidence: InsightConfidence;
  /** Larger is more worth reading. See `rank`. */
  score: number;
}

export interface PeriodTotals {
  revenue: number;
  orders: number;
}

export interface DerivedTotals extends PeriodTotals {
  /** The platform's definition: rounded whole Toman, as `analytics.ts` has it. */
  averageOrderValue: number;
}

export interface EntityTotals {
  /** Product id, or `deleted:<name>` for history whose product is gone. */
  key: string;
  id: string | null;
  name: string;
  revenue: number;
  quantity: number;
}

export interface CustomerActivity {
  /** Orders that carried an identified guest. */
  identifiedOrders: number;
  /** Of those, guests whose first ever order fell inside the window. */
  newCustomerOrders: number;
  returningCustomerOrders: number;
}

/** One promoted dish or suggestion, as the merchandising reports already count it. */
export interface MerchandisingSurface {
  key: string;
  name: string;
  impressions: number;
  addedToCart: number;
  purchases: number;
}

export interface SalesInsightInput {
  current: PeriodTotals;
  previous: PeriodTotals;
  products: { current: EntityTotals[]; previous: EntityTotals[] };
  categories: { current: EntityTotals[]; previous: EntityTotals[] };
  customers?: { current: CustomerActivity; previous: CustomerActivity };
  featured?: MerchandisingSurface[];
  recommendations?: MerchandisingSurface[];
  /**
   * Realised per-dish economics for the current period.
   *
   * Optional, so every existing caller keeps working and simply produces no
   * profitability insights — which is the honest outcome for a caller that has
   * not supplied any cost information.
   *
   * Already classified by `profitability.ts` rather than raw: placing a dish on
   * the volume/margin grid is arithmetic that module owns, and re-deriving it
   * here would give the analytics table and the insight beneath it two chances
   * to disagree about the same dish.
   */
  profitability?: {
    products: readonly ProductPerformance[];
    benchmark: MenuBenchmark;
    coverage: CostCoverage;
    concentration: MenuConcentration;
  };
}

/**
 * How a revenue movement splits across the two things that produce it.
 *
 * Revenue is orders × average ticket, so a change in it is exactly:
 *
 *     Δrevenue = Δorders·ticketₚ + Δticket·ordersₚ + Δorders·Δticket
 *
 * The three terms are the volume effect, the value effect, and the corner where
 * both moved. They sum to the revenue change by construction, which is what
 * makes this an explanation rather than a narrative.
 */
export interface RevenueDecomposition {
  revenueDelta: number;
  revenueDeltaPercent: number | null;
  orderDelta: number;
  orderDeltaPercent: number | null;
  aovDelta: number;
  aovDeltaPercent: number | null;
  volumeEffect: number;
  valueEffect: number;
  interactionEffect: number;
  /** Which side dominates, or `both`/`none`. Association, never cause. */
  driver: RevenueDriver;
  /** The dominant side's share of the movement, 0–1. */
  driverShare: number;
}

export type InsightStatus = "ok" | "insufficientData";

export interface SalesInsightReport {
  status: InsightStatus;
  insights: SalesInsight[];
  decomposition: RevenueDecomposition | null;
  totals: { current: DerivedTotals; previous: DerivedTotals };
}

// -------------------------------- helpers ----------------------------------

/**
 * Proportional change as a fraction.
 *
 * Growth from nothing is not "infinite percent" — it is simply new, and null
 * says so. Nothing-to-nothing is flat. The same two cases `percentDelta` in
 * `dashboard-insights.ts` handles; this returns a fraction rather than a
 * rounded whole percent because every threshold here is a fraction and
 * `formatPercent` takes one.
 */
export function ratioDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** Unrounded average ticket, for arithmetic that has to add back up. */
function exactAov(totals: PeriodTotals): number {
  return totals.orders > 0 ? totals.revenue / totals.orders : 0;
}

function derive(totals: PeriodTotals): DerivedTotals {
  return { ...totals, averageOrderValue: Math.round(exactAov(totals)) };
}

/** Whether a movement clears both the proportional and the absolute floor. */
function isMeaningful(
  deltaPercent: number | null,
  deltaAbsolute: number,
  minAbsolute: number,
): boolean {
  if (deltaPercent === null) return false;
  return (
    Math.abs(deltaPercent) >= INSIGHT_THRESHOLDS.minPercentChange &&
    Math.abs(deltaAbsolute) >= minAbsolute
  );
}

const TYPE_WEIGHT: Record<InsightType, number> = {
  revenueChange: 1,
  revenueDriver: 0.95,
  orderVolumeChange: 0.9,
  /*
    Margin outranks the basket, and deliberately.

    A dish selling heavily at a margin a third of the menu's is a bigger
    business problem than a 9% move in the average ticket, because it is losing
    money on every sale rather than on the difference. It sits just under the
    revenue decomposition, which is still the first thing an owner should read.
  */
  highSalesLowMargin: 0.89,
  aovChange: 0.88,
  topNegativeContributor: 0.85,
  topPositiveContributor: 0.8,
  categoryDecline: 0.75,
  categoryGrowth: 0.7,
  /* An opportunity, so below every problem but above the housekeeping. */
  lowSalesHighMargin: 0.65,
  customerMixChange: 0.6,
  menuConcentration: 0.5,
  /*
    Lowest of all, and it belongs there: it is a data-quality notice, not a
    finding about the business. But it is *not* omitted, because an owner
    reading a margin built from half the revenue needs to know that.
  */
  costDataIncomplete: 0.25,
  featuredWeakConversion: 0.3,
  recommendationWeakConversion: 0.3,
  /*
    Table rules rank among themselves, never against the menu rules — they are
    built by a separate entry point and shown on their own screen. The weights
    still matter, because the four of them compete for the top of that list.

    A table going quiet outranks a table doing well, on the same principle the
    revenue rules follow: a problem is worth reading before a compliment.
  */
  tableActivityDecline: 0.9,
  tableViewsWithoutOrders: 0.7,
  tableHighActivity: 0.6,
  tableConcentration: 0.5,
};

/**
 * Ranking, so the page opens with the thing worth knowing.
 *
 * Money first: a 25% fall worth 30,000,000 Toman must outrank a 4% one worth
 * 200,000. `impact` is therefore the movement expressed in Toman wherever a
 * rule has one — order and basket insights are converted through the previous
 * period's figures so they are comparable with revenue rather than being counts
 * on a different scale.
 *
 * Type weight then separates rules that would otherwise tie on the same money —
 * the headline outranks its own decomposition — and a thin finding is halved so
 * it sits below a solid one of the same size.
 */
function scoreOf(type: InsightType, impact: number, confidence: InsightConfidence) {
  return Math.abs(impact) * TYPE_WEIGHT[type] * (confidence === "high" ? 1 : 0.5);
}

function rank(insights: SalesInsight[]): SalesInsight[] {
  // Ties break on id so the order is total, not dependent on insertion.
  return [...insights].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// --------------------------------- rules -----------------------------------

function decompose(
  current: PeriodTotals,
  previous: PeriodTotals,
  revenueMoved: boolean,
): RevenueDecomposition {
  const aovCurrent = exactAov(current);
  const aovPrevious = exactAov(previous);

  const orderDelta = current.orders - previous.orders;
  const aovDelta = aovCurrent - aovPrevious;

  const volumeEffect = orderDelta * aovPrevious;
  const valueEffect = aovDelta * previous.orders;
  const interactionEffect = orderDelta * aovDelta;

  const magnitude = Math.abs(volumeEffect) + Math.abs(valueEffect);
  const volumeShare = magnitude > 0 ? Math.abs(volumeEffect) / magnitude : 0;

  let driver: RevenueDriver = "none";
  let driverShare = 0;

  if (revenueMoved && magnitude > 0) {
    if (volumeShare >= INSIGHT_THRESHOLDS.driverShare) {
      driver = "orders";
      driverShare = volumeShare;
    } else if (1 - volumeShare >= INSIGHT_THRESHOLDS.driverShare) {
      driver = "averageOrderValue";
      driverShare = 1 - volumeShare;
    } else {
      driver = "both";
      driverShare = Math.max(volumeShare, 1 - volumeShare);
    }
  }

  return {
    revenueDelta: current.revenue - previous.revenue,
    revenueDeltaPercent: ratioDelta(current.revenue, previous.revenue),
    orderDelta,
    orderDeltaPercent: ratioDelta(current.orders, previous.orders),
    aovDelta: Math.round(aovDelta),
    aovDeltaPercent: ratioDelta(aovCurrent, aovPrevious),
    volumeEffect,
    valueEffect,
    interactionEffect,
    driver,
    driverShare,
  };
}

/** Pairs the same entity across both periods, keyed on its stable key. */
function pairEntities(
  current: readonly EntityTotals[],
  previous: readonly EntityTotals[],
): {
  entity: EntityTotals;
  currentRevenue: number;
  previousRevenue: number;
  delta: number;
  maxRevenue: number;
  maxQuantity: number;
}[] {
  const byKey = new Map<
    string,
    { entity: EntityTotals; cur?: EntityTotals; prev?: EntityTotals }
  >();

  for (const row of current) {
    byKey.set(row.key, { entity: row, cur: row });
  }
  for (const row of previous) {
    const existing = byKey.get(row.key);
    if (existing) existing.prev = row;
    // A product that sold last period and not this one still has to be visible,
    // or a dish falling to zero would silently vanish from the comparison.
    else byKey.set(row.key, { entity: row, prev: row });
  }

  return (
    [...byKey.values()]
      .map(({ entity, cur, prev }) => ({
        entity,
        currentRevenue: cur?.revenue ?? 0,
        previousRevenue: prev?.revenue ?? 0,
        delta: (cur?.revenue ?? 0) - (prev?.revenue ?? 0),
        maxRevenue: Math.max(cur?.revenue ?? 0, prev?.revenue ?? 0),
        maxQuantity: Math.max(cur?.quantity ?? 0, prev?.quantity ?? 0),
      }))
      // Deterministic before any ranking, so equal movements resolve the same way.
      .sort((a, b) => a.entity.key.localeCompare(b.entity.key))
  );
}

// -------------------------------- the engine -------------------------------

export function buildSalesInsights(input: SalesInsightInput): SalesInsightReport {
  const totals = { current: derive(input.current), previous: derive(input.previous) };

  // A baseline that barely traded cannot support a percentage. Reported as
  // "not enough data" rather than as a dramatic-looking change.
  if (input.previous.orders < INSIGHT_THRESHOLDS.minOrdersPerPeriod) {
    return { status: "insufficientData", insights: [], decomposition: null, totals };
  }

  /**
   * A statement about the *baseline*, not about how small the current period is.
   *
   * It was briefly `min(current, previous)`, which marked a venue that took 359
   * orders and then stopped as "based on thin data" — telling the owner to
   * discount the one finding they most needed to see. What makes a comparison
   * trustworthy is having enough history to compare against; a current period
   * of zero is a result, not a data problem.
   */
  const confidence: InsightConfidence =
    input.previous.orders >= INSIGHT_THRESHOLDS.lowConfidenceOrders ? "high" : "low";

  const insights: SalesInsight[] = [];

  const revenueDelta = input.current.revenue - input.previous.revenue;
  const revenueDeltaPercent = ratioDelta(input.current.revenue, input.previous.revenue);
  const revenueMoved = isMeaningful(
    revenueDeltaPercent,
    revenueDelta,
    INSIGHT_THRESHOLDS.minRevenueDelta,
  );

  const decomposition = decompose(input.current, input.previous, revenueMoved);

  // --- A. revenue ----------------------------------------------------------
  if (revenueMoved) {
    const down = revenueDelta < 0;
    insights.push({
      id: "revenueChange",
      type: "revenueChange",
      severity: down ? "critical" : "positive",
      direction: down ? "down" : "up",
      messageKey: down ? "revenueDown" : "revenueUp",
      values: {
        percent: Math.abs(revenueDeltaPercent ?? 0),
        amount: Math.abs(revenueDelta),
        current: input.current.revenue,
        previous: input.previous.revenue,
      },
      metric: input.current.revenue,
      comparison: input.previous.revenue,
      deltaAbsolute: revenueDelta,
      deltaPercent: revenueDeltaPercent,
      confidence,
      score: scoreOf("revenueChange", revenueDelta, confidence),
    });
  }

  // --- "why did it move?" --------------------------------------------------
  if (revenueMoved && decomposition.driver !== "none") {
    insights.push({
      id: "revenueDriver",
      type: "revenueDriver",
      severity: "neutral",
      direction: revenueDelta < 0 ? "down" : "up",
      messageKey:
        decomposition.driver === "orders"
          ? "driverOrders"
          : decomposition.driver === "averageOrderValue"
            ? "driverBasket"
            : "driverBoth",
      values: {
        driverShare: decomposition.driverShare,
        orderPercent: decomposition.orderDeltaPercent ?? 0,
        aovPercent: decomposition.aovDeltaPercent ?? 0,
        volumeEffect: decomposition.volumeEffect,
        valueEffect: decomposition.valueEffect,
      },
      metric: input.current.revenue,
      comparison: input.previous.revenue,
      deltaAbsolute: revenueDelta,
      deltaPercent: revenueDeltaPercent,
      confidence,
      score: scoreOf("revenueDriver", revenueDelta, confidence),
    });
  }

  // --- B. order volume -----------------------------------------------------
  if (
    isMeaningful(
      decomposition.orderDeltaPercent,
      decomposition.orderDelta,
      INSIGHT_THRESHOLDS.minOrderDelta,
    )
  ) {
    const down = decomposition.orderDelta < 0;
    insights.push({
      id: "orderVolumeChange",
      type: "orderVolumeChange",
      severity: down ? "warning" : "positive",
      direction: down ? "down" : "up",
      messageKey: down ? "ordersDown" : "ordersUp",
      values: {
        percent: Math.abs(decomposition.orderDeltaPercent ?? 0),
        count: Math.abs(decomposition.orderDelta),
        current: input.current.orders,
        previous: input.previous.orders,
      },
      metric: input.current.orders,
      comparison: input.previous.orders,
      deltaAbsolute: decomposition.orderDelta,
      deltaPercent: decomposition.orderDeltaPercent,
      confidence,
      // Expressed in Toman so it is comparable with the revenue rules.
      score: scoreOf("orderVolumeChange", decomposition.volumeEffect, confidence),
    });
  }

  // --- C. average order value ---------------------------------------------
  if (
    isMeaningful(
      decomposition.aovDeltaPercent,
      decomposition.aovDelta,
      INSIGHT_THRESHOLDS.minAovDelta,
    )
  ) {
    const down = decomposition.aovDelta < 0;
    insights.push({
      id: "aovChange",
      type: "aovChange",
      severity: down ? "warning" : "positive",
      direction: down ? "down" : "up",
      messageKey: down ? "basketDown" : "basketUp",
      values: {
        percent: Math.abs(decomposition.aovDeltaPercent ?? 0),
        amount: Math.abs(decomposition.aovDelta),
        current: totals.current.averageOrderValue,
        previous: totals.previous.averageOrderValue,
      },
      metric: totals.current.averageOrderValue,
      comparison: totals.previous.averageOrderValue,
      deltaAbsolute: decomposition.aovDelta,
      deltaPercent: decomposition.aovDeltaPercent,
      confidence,
      score: scoreOf("aovChange", decomposition.valueEffect, confidence),
    });
  }

  // --- D/F/G. product contributors ----------------------------------------
  const products = pairEntities(input.products.current, input.products.previous).filter(
    (row) =>
      row.maxRevenue >= INSIGHT_THRESHOLDS.minProductRevenue &&
      row.maxQuantity >= INSIGHT_THRESHOLDS.minProductQuantity,
  );

  /**
   * Shares are taken against the total product-line movement in the same
   * direction — never against net revenue. Line revenue is
   * `priceSnapshot × quantity`, which excludes tax, tip, discounts and the
   * service charge, so a share of net revenue would be a ratio of two different
   * quantities and could not be reconciled with anything else on the page.
   */
  const totalDecline = products.reduce((sum, r) => sum + Math.min(0, r.delta), 0);
  const totalGrowth = products.reduce((sum, r) => sum + Math.max(0, r.delta), 0);

  const worst = products
    .filter((r) => r.delta <= -INSIGHT_THRESHOLDS.minProductRevenueDelta)
    .sort((a, b) => a.delta - b.delta || a.entity.key.localeCompare(b.entity.key))[0];

  if (worst) {
    insights.push({
      id: `topNegativeContributor:${worst.entity.key}`,
      type: "topNegativeContributor",
      severity: "warning",
      direction: "down",
      messageKey: "productContributedDecline",
      values: {
        amount: Math.abs(worst.delta),
        share: totalDecline < 0 ? Math.abs(worst.delta / totalDecline) : 0,
        current: worst.currentRevenue,
        previous: worst.previousRevenue,
      },
      metric: worst.currentRevenue,
      comparison: worst.previousRevenue,
      deltaAbsolute: worst.delta,
      deltaPercent: ratioDelta(worst.currentRevenue, worst.previousRevenue),
      entity: { kind: "product", id: worst.entity.id, name: worst.entity.name },
      actionKey: "reviewProductPlacement",
      confidence,
      score: scoreOf("topNegativeContributor", worst.delta, confidence),
    });
  }

  const best = products
    .filter((r) => r.delta >= INSIGHT_THRESHOLDS.minProductRevenueDelta)
    .sort((a, b) => b.delta - a.delta || a.entity.key.localeCompare(b.entity.key))[0];

  if (best) {
    insights.push({
      id: `topPositiveContributor:${best.entity.key}`,
      type: "topPositiveContributor",
      severity: "positive",
      direction: "up",
      messageKey: "productContributedGrowth",
      values: {
        amount: best.delta,
        share: totalGrowth > 0 ? best.delta / totalGrowth : 0,
        current: best.currentRevenue,
        previous: best.previousRevenue,
      },
      metric: best.currentRevenue,
      comparison: best.previousRevenue,
      deltaAbsolute: best.delta,
      deltaPercent: ratioDelta(best.currentRevenue, best.previousRevenue),
      entity: { kind: "product", id: best.entity.id, name: best.entity.name },
      actionKey: "featureProductMore",
      confidence,
      score: scoreOf("topPositiveContributor", best.delta, confidence),
    });
  }

  // --- E. categories -------------------------------------------------------
  const categories = pairEntities(
    input.categories.current,
    input.categories.previous,
  ).filter((row) => row.maxRevenue >= INSIGHT_THRESHOLDS.minCategoryRevenue);

  const categoryDown = categories
    .filter((r) => r.delta <= -INSIGHT_THRESHOLDS.minCategoryRevenueDelta)
    .filter((r) =>
      isMeaningful(
        ratioDelta(r.currentRevenue, r.previousRevenue),
        r.delta,
        INSIGHT_THRESHOLDS.minCategoryRevenueDelta,
      ),
    )
    .sort((a, b) => a.delta - b.delta || a.entity.key.localeCompare(b.entity.key))[0];

  if (categoryDown) {
    insights.push({
      id: `categoryDecline:${categoryDown.entity.key}`,
      type: "categoryDecline",
      severity: "warning",
      direction: "down",
      messageKey: "categoryDown",
      values: {
        amount: Math.abs(categoryDown.delta),
        percent: Math.abs(
          ratioDelta(categoryDown.currentRevenue, categoryDown.previousRevenue) ?? 0,
        ),
      },
      metric: categoryDown.currentRevenue,
      comparison: categoryDown.previousRevenue,
      deltaAbsolute: categoryDown.delta,
      deltaPercent: ratioDelta(categoryDown.currentRevenue, categoryDown.previousRevenue),
      entity: {
        kind: "category",
        id: categoryDown.entity.id,
        name: categoryDown.entity.name,
      },
      confidence,
      score: scoreOf("categoryDecline", categoryDown.delta, confidence),
    });
  }

  const categoryUp = categories
    .filter((r) => r.delta >= INSIGHT_THRESHOLDS.minCategoryRevenueDelta)
    .filter((r) =>
      isMeaningful(
        ratioDelta(r.currentRevenue, r.previousRevenue),
        r.delta,
        INSIGHT_THRESHOLDS.minCategoryRevenueDelta,
      ),
    )
    .sort((a, b) => b.delta - a.delta || a.entity.key.localeCompare(b.entity.key))[0];

  if (categoryUp) {
    insights.push({
      id: `categoryGrowth:${categoryUp.entity.key}`,
      type: "categoryGrowth",
      severity: "positive",
      direction: "up",
      messageKey: "categoryUp",
      values: {
        amount: categoryUp.delta,
        percent: Math.abs(
          ratioDelta(categoryUp.currentRevenue, categoryUp.previousRevenue) ?? 0,
        ),
      },
      metric: categoryUp.currentRevenue,
      comparison: categoryUp.previousRevenue,
      deltaAbsolute: categoryUp.delta,
      deltaPercent: ratioDelta(categoryUp.currentRevenue, categoryUp.previousRevenue),
      entity: {
        kind: "category",
        id: categoryUp.entity.id,
        name: categoryUp.entity.name,
      },
      confidence,
      score: scoreOf("categoryGrowth", categoryUp.delta, confidence),
    });
  }

  // --- H. customer behaviour ----------------------------------------------
  const customers = input.customers;
  if (
    customers &&
    customers.current.identifiedOrders >= INSIGHT_THRESHOLDS.minIdentifiedOrders &&
    customers.previous.identifiedOrders >= INSIGHT_THRESHOLDS.minIdentifiedOrders
  ) {
    const delta =
      customers.current.returningCustomerOrders -
      customers.previous.returningCustomerOrders;
    const percent = ratioDelta(
      customers.current.returningCustomerOrders,
      customers.previous.returningCustomerOrders,
    );

    if (isMeaningful(percent, delta, INSIGHT_THRESHOLDS.minReturningOrderDelta)) {
      const down = delta < 0;
      insights.push({
        id: "customerMixChange",
        type: "customerMixChange",
        severity: down ? "warning" : "positive",
        direction: down ? "down" : "up",
        messageKey: down ? "returningDown" : "returningUp",
        values: {
          percent: Math.abs(percent ?? 0),
          count: Math.abs(delta),
          current: customers.current.returningCustomerOrders,
          previous: customers.previous.returningCustomerOrders,
        },
        metric: customers.current.returningCustomerOrders,
        comparison: customers.previous.returningCustomerOrders,
        deltaAbsolute: delta,
        deltaPercent: percent,
        confidence,
        // Converted to Toman at the previous basket so it ranks against revenue.
        score: scoreOf("customerMixChange", delta * exactAov(input.previous), confidence),
      });
    }
  }

  // --- merchandising surfaces ---------------------------------------------
  // Reuses `merchandisingRatio`, the platform's existing conversion definition.
  // Nothing here recomputes an event count or invents an impression.
  for (const [surface, type, messageKey, action] of [
    [
      input.featured,
      "featuredWeakConversion",
      "featuredWeakConversion",
      "reviewFeaturedDish",
    ],
    [
      input.recommendations,
      "recommendationWeakConversion",
      "recommendationWeakConversion",
      "reviewSuggestion",
    ],
  ] as const) {
    if (!surface) continue;

    const weak = [...surface]
      .filter((row) => row.impressions >= INSIGHT_THRESHOLDS.minImpressions)
      .filter(
        (row) =>
          merchandisingRatio(row.purchases, row.impressions) <
          INSIGHT_THRESHOLDS.weakConversionRate,
      )
      .sort((a, b) => b.impressions - a.impressions || a.key.localeCompare(b.key))[0];

    if (!weak) continue;

    insights.push({
      id: `${type}:${weak.key}`,
      type,
      severity: "neutral",
      direction: "flat",
      messageKey,
      values: {
        impressions: weak.impressions,
        addedToCart: weak.addedToCart,
        purchases: weak.purchases,
        conversionRate: merchandisingRatio(weak.purchases, weak.impressions),
      },
      metric: weak.purchases,
      comparison: weak.impressions,
      deltaAbsolute: 0,
      deltaPercent: null,
      entity: { kind: "product", id: null, name: weak.name },
      actionKey: action,
      confidence,
      // No revenue movement of its own; impressions keep the ordering stable
      // and the low type weight keeps it below anything financial.
      score: scoreOf(type, weak.impressions, confidence),
    });
  }

  // --- I. profitability -----------------------------------------------------
  /*
    What sold well but earned little, and what earned well but barely sold.

    The placement itself is `profitability.ts`'s job — every dish arrives
    already on the grid, with its own low-data guards applied. What happens here
    is only the decision about whether it is worth an owner's attention, which
    is what this engine exists to decide.

    Nothing in this block re-derives a margin, a benchmark or a quadrant.
  */
  if (input.profitability) {
    const { products, benchmark, coverage, concentration } = input.profitability;

    /*
      Cost coverage gates the two margin rules entirely.

      A margin computed from half a venue's revenue is not a weak signal, it is
      an unknown one — and naming a specific dish as low-margin on that basis
      would be exactly the false precision this feature must not have. When
      coverage is poor the engine says *that* instead, which is the true and
      useful thing to say.
    */
    /*
      `typicalMargin` throughout, never `menuMargin`.

      The sentence an owner reads must quote the figure that actually produced
      the judgement. `menuMargin` is the revenue-weighted average — the right
      thing to *display* as "what my turnover earns" — but the classification
      compares against the median dish, and on a skewed menu the two can sit far
      enough apart to print a dish's margin as higher than the number it is
      being called weak against. Quoting the deciding figure keeps the claim
      checkable, which is the whole point of showing it.
    */
    const marginsAreTrustworthy =
      coverage.confidence === "reliable" && benchmark.typicalMargin !== null;

    if (marginsAreTrustworthy) {
      // Worst offender first: the dish losing the most margin against the menu.
      const weak = products
        .filter((p) => p.quadrant === "reviewPricing" && p.margin !== null)
        .sort((a, b) => b.revenue - a.revenue || a.key.localeCompare(b.key))[0];

      if (weak) {
        /*
          The impact, in Toman: what this dish would have earned at the menu's
          own margin, less what it did earn. That makes the score directly
          comparable with every revenue movement above, which is the whole
          reason the ranking works across rule types.
        */
        const shortfall = weak.revenue * (benchmark.typicalMargin! - (weak.margin ?? 0));

        insights.push({
          id: `highSalesLowMargin:${weak.key}`,
          type: "highSalesLowMargin",
          severity: "warning",
          direction: "flat",
          messageKey: "highSalesLowMargin",
          values: {
            margin: weak.margin ?? 0,
            menuMargin: benchmark.typicalMargin!,
            revenue: weak.revenue,
            quantity: weak.quantity,
            cost: weak.cost,
            shortfall,
          },
          metric: weak.margin ?? 0,
          comparison: benchmark.typicalMargin!,
          deltaAbsolute: shortfall,
          deltaPercent: null,
          entity: { kind: "product", id: weak.id, name: weak.name },
          // Points at the product editor, which already owns price and cost.
          actionKey: "reviewProductPricing",
          confidence,
          score: scoreOf("highSalesLowMargin", shortfall, confidence),
        });
      }

      // And the mirror: good economics, no volume. An opportunity, not a fault.
      const quiet = products
        .filter((p) => p.quadrant === "promote" && p.margin !== null)
        .sort(
          (a, b) => (b.margin ?? 0) - (a.margin ?? 0) || a.key.localeCompare(b.key),
        )[0];

      if (quiet) {
        /*
          Upside, stated conservatively: what this dish would add if it merely
          reached the high-volume bar — not a forecast, and deliberately not
          presented as one. It exists to rank the finding, and the message the
          owner reads states the margin and the sales, never a prediction.
        */
        const headroom =
          Math.max(
            0,
            benchmark.highVolumeShare * totalRevenueOf(products) - quiet.revenue,
          ) * (quiet.margin ?? 0);

        insights.push({
          id: `lowSalesHighMargin:${quiet.key}`,
          type: "lowSalesHighMargin",
          severity: "positive",
          direction: "flat",
          messageKey: "lowSalesHighMargin",
          values: {
            margin: quiet.margin ?? 0,
            menuMargin: benchmark.typicalMargin!,
            revenue: quiet.revenue,
            quantity: quiet.quantity,
          },
          metric: quiet.margin ?? 0,
          comparison: benchmark.typicalMargin!,
          deltaAbsolute: 0,
          deltaPercent: null,
          entity: { kind: "product", id: quiet.id, name: quiet.name },
          // Points at Part 1's merchandising screen, which already exists.
          actionKey: "promoteProduct",
          confidence,
          score: scoreOf("lowSalesHighMargin", headroom, confidence),
        });
      }
    }

    /*
      Why a margin is missing, rather than a missing margin.

      Emitted whenever coverage is anything short of reliable — including when
      it is so poor that the two rules above stayed silent, which is precisely
      when an owner most needs to be told why the screen has gone quiet.
    */
    if (coverage.confidence !== "reliable" && coverage.uncostedProducts > 0) {
      insights.push({
        id: "costDataIncomplete",
        type: "costDataIncomplete",
        severity: "neutral",
        direction: "flat",
        messageKey: "costDataIncomplete",
        values: {
          products: coverage.uncostedProducts,
          coverage: coverage.coverage,
          uncostedRevenue: coverage.uncostedRevenue,
        },
        metric: coverage.coverage,
        comparison: 1,
        deltaAbsolute: coverage.uncostedRevenue,
        deltaPercent: null,
        actionKey: "addProductCosts",
        confidence,
        score: scoreOf("costDataIncomplete", coverage.uncostedRevenue, confidence),
      });
    }

    /*
      Concentration risk. An observation about exposure, with no claim that a
      concentrated menu is wrong — plenty of excellent restaurants sell four
      things.
    */
    if (concentration.isConcentrated) {
      insights.push({
        id: "menuConcentration",
        type: "menuConcentration",
        severity: "neutral",
        direction: "flat",
        messageKey: "menuConcentration",
        values: { share: concentration.share, count: concentration.topN },
        metric: concentration.share,
        comparison: 1,
        deltaAbsolute: 0,
        deltaPercent: null,
        confidence,
        score: scoreOf(
          "menuConcentration",
          concentration.share * input.current.revenue,
          confidence,
        ),
      });
    }
  }

  return { status: "ok", insights: rank(insights), decomposition, totals };
}

// ------------------------------- table rules --------------------------------

export interface TableInsightInput {
  report: TableReport;
  concentration: TableConcentration | null;
}

/**
 * What is worth saying about the room.
 *
 * A separate entry point rather than a branch inside `buildSalesInsights`,
 * because these answer a question asked on a different screen: the analytics
 * page explains why revenue moved, and this explains which tables it moved at.
 * Folding them together would put four table findings into a list an owner
 * opens to read about their menu, and rank them against it on a scale neither
 * shares. Everything else is reused — the `SalesInsight` shape, the severities,
 * `scoreOf`, `rank`, and the `t.insights` message contract — so the table page
 * renders these with the analytics page's own card component.
 *
 * ### Descriptive only
 *
 * Every rule below states what the figures show and stops. None of them
 * concludes that a QR code has failed, that a table is badly placed, or that
 * guests dislike it — the data cannot distinguish those, and a sentence that
 * picked one would be a guess wearing a measurement's clothes. The owner knows
 * the room; this tells them where to look in it.
 */
export function buildTableInsights(input: TableInsightInput): SalesInsight[] {
  const { report, concentration } = input;
  const insights: SalesInsight[] = [];

  /*
    The same confidence rule the sales rules use, read off the same threshold:
    a finding drawn from under thirty orders is still reported, but quietly.
  */
  const confidence: InsightConfidence =
    report.totals.orders >= INSIGHT_THRESHOLDS.lowConfidenceOrders ? "high" : "low";

  const fairShareRevenue =
    report.totals.activeTables > 0
      ? report.totals.revenue / report.totals.activeTables
      : 0;

  /*
    The busiest table, when the venue has enough trade for "busiest" to mean
    something. `activity` is already null when it does not, so the band does the
    gating and nothing here re-derives it.
  */
  const busiest = report.rows
    .filter(
      (row) =>
        row.activity === "high" && row.revenue >= INSIGHT_THRESHOLDS.minCategoryRevenue,
    )
    .sort((a, b) => b.revenue - a.revenue || a.number.localeCompare(b.number))[0];

  if (busiest) {
    insights.push({
      id: `tableHighActivity:${busiest.key}`,
      type: "tableHighActivity",
      severity: "positive",
      direction: "up",
      messageKey: "tableHighActivity",
      values: {
        orders: busiest.orders,
        revenue: busiest.revenue,
        share: busiest.revenueShare,
      },
      metric: busiest.revenue,
      comparison: Math.round(fairShareRevenue),
      deltaAbsolute: busiest.revenue - fairShareRevenue,
      deltaPercent: null,
      entity: { kind: "table", id: busiest.id, name: busiest.number },
      confidence,
      score: scoreOf("tableHighActivity", busiest.revenue - fairShareRevenue, confidence),
    });
  }

  /*
    The table that has gone quietest, measured in money against the same window
    a period earlier.

    Gated on the previous window having real trade at that table: a table that
    took two orders last month and one this month has not declined, it has been
    used twice. `isMeaningful` then applies the platform's own floors — 8% and
    500,000 Toman — so this rule agrees with every other rule about what counts
    as a movement.
  */
  const declined = report.rows
    .filter((row) => {
      if (!row.trend) return false;
      if (row.trend.previousOrders < INSIGHT_THRESHOLDS.minOrdersPerPeriod) return false;
      if (row.revenue >= row.trend.previousRevenue) return false;

      return isMeaningful(
        row.trend.revenueDelta,
        row.revenue - row.trend.previousRevenue,
        INSIGHT_THRESHOLDS.minRevenueDelta,
      );
    })
    .sort(
      (a, b) =>
        a.revenue - a.trend!.previousRevenue - (b.revenue - b.trend!.previousRevenue) ||
        a.number.localeCompare(b.number),
    )[0];

  if (declined?.trend) {
    const drop = declined.revenue - declined.trend.previousRevenue;

    insights.push({
      id: `tableActivityDecline:${declined.key}`,
      type: "tableActivityDecline",
      severity: "warning",
      direction: "down",
      messageKey: "tableActivityDecline",
      values: {
        orders: declined.orders,
        previousOrders: declined.trend.previousOrders,
        amount: Math.abs(drop),
        percent: declined.trend.revenueDelta ?? 0,
      },
      metric: declined.revenue,
      comparison: declined.trend.previousRevenue,
      deltaAbsolute: drop,
      deltaPercent: declined.trend.revenueDelta,
      entity: { kind: "table", id: declined.id, name: declined.number },
      confidence,
      score: scoreOf("tableActivityDecline", drop, confidence),
    });
  }

  /*
    A table whose code is opened often while comparatively few orders follow.

    The one rule on this screen that could most easily become a false claim, so
    it is the most heavily gated:

      * `views.status` must be `measured`, which already requires that most of
        the venue's traffic could be attributed to a table at all.
      * Each row's own `visits.status` must be `measured`, which requires the
        table to have cleared the 30-open floor on its own.
      * There must be a roomful of such tables to compare against, so the bar is
        the venue's own observed rate rather than a number invented here.

    And it says only that: opens are high and orders are lower. Not that the
    code is broken, not that the table is bad. Both are possible; so is a table
    by the door that everyone reads the menu at while waiting for a seat.
  */
  const measured = report.rows.filter((row) => row.visits.status === "measured");

  if (
    report.views.status === "measured" &&
    measured.length >= TABLE_THRESHOLDS.minTablesForBands
  ) {
    const venueViews = measured.reduce((sum, row) => sum + row.visits.views, 0);
    const venueOrders = measured.reduce((sum, row) => sum + row.visits.orders, 0);
    const venueRatio = venueViews > 0 ? venueOrders / venueViews : 0;

    const lagging = measured
      .filter(
        (row) =>
          venueRatio > 0 &&
          (row.visits.ratio ?? 0) <= venueRatio * TABLE_THRESHOLDS.lowActivityShareFactor,
      )
      .sort(
        (a, b) => b.visits.views - a.visits.views || a.number.localeCompare(b.number),
      )[0];

    if (lagging) {
      /*
        Ranked by the orders the table would have taken at the room's own rate,
        less the orders it took, valued at its own average ticket. A gap, not a
        forecast — nothing tells the owner those orders were available.
      */
      const expected = lagging.visits.views * venueRatio;
      const gap = Math.max(0, expected - lagging.visits.orders);

      insights.push({
        id: `tableViewsWithoutOrders:${lagging.key}`,
        type: "tableViewsWithoutOrders",
        // Neutral, deliberately. It is an observation to investigate, not a
        // fault to fix, and a warning badge would assert more than the data.
        severity: "neutral",
        direction: "flat",
        messageKey: "tableViewsWithoutOrders",
        values: {
          views: lagging.visits.views,
          orders: lagging.visits.orders,
          ratio: lagging.visits.ratio ?? 0,
          venueRatio,
        },
        metric: lagging.visits.orders,
        comparison: Math.round(expected),
        deltaAbsolute: gap,
        deltaPercent: null,
        entity: { kind: "table", id: lagging.id, name: lagging.number },
        confidence,
        score: scoreOf(
          "tableViewsWithoutOrders",
          gap * lagging.averageOrderValue,
          confidence,
        ),
      });
    }
  }

  /*
    Exposure, with no claim that it is wrong. A venue whose four window tables
    take most of the money is a normal venue with a good window.
  */
  if (concentration) {
    /*
      Ranked on the revenue held *above* an even spread, not on the top slice's
      whole share.

      The distinction decides the order of the page. `share × totalRevenue` is a
      fraction of the venue's entire turnover, while every other rule here
      scores a *movement* — so concentration measured that way outranked a
      25,000,000 Toman collapse at table 2 simply because turnover is a bigger
      number than any change in it. The excess over an even room is the part
      that is actually about concentration, and it is on the same scale as the
      deltas it competes with.
    */
    const evenShare =
      report.totals.activeTables > 0
        ? Math.min(1, concentration.tables.length / report.totals.activeTables)
        : 1;
    const excess =
      Math.max(0, concentration.topShare - evenShare) * report.totals.revenue;

    insights.push({
      id: "tableConcentration",
      type: "tableConcentration",
      severity: "neutral",
      direction: "flat",
      messageKey: "tableConcentration",
      values: {
        share: concentration.topShare,
        count: concentration.tables.length,
      },
      metric: concentration.topShare,
      comparison: 1,
      deltaAbsolute: 0,
      deltaPercent: null,
      confidence,
      score: scoreOf("tableConcentration", excess, confidence),
    });
  }

  return rank(insights);
}

/** Period revenue across the classified dishes, for the headroom arithmetic. */
function totalRevenueOf(products: readonly ProductPerformance[]): number {
  return products.reduce((sum, product) => sum + product.revenue, 0);
}
