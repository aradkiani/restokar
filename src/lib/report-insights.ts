import type { DayPoint } from "./analytics";

/**
 * Turns the figures the report already computes into a small set of judgements
 * an owner can act on.
 *
 * Two questions drive it, both asked of numbers the report already has:
 *
 *  1. Is the average ticket about right, or is there room to charge slightly
 *     more? Order volume is the evidence — a venue people keep coming back to
 *     while it earns little per sale is under-charging, whereas one whose
 *     footfall is already slipping cannot price its way out.
 *  2. Is the profit healthy for the volume being done? Turnover on its own says
 *     nothing; what matters is what survives to the bottom line.
 *
 * The thresholds and ratios below never reach the page. They exist only to pick
 * which sentences the report prints — the owner reads advice, not arithmetic.
 */

/**
 * Net-margin bands for table service. Operators generally treat roughly 8% as
 * the line between surviving and healthy, and 15% as genuinely strong; below
 * zero the venue is paying to trade.
 */
const MARGIN_STRONG = 0.15;
const MARGIN_HEALTHY = 0.08;

/** Half-over-half swings smaller than this are noise, not a trend. */
const TREND_DEADBAND = 0.1;

/** Expenses eating more than this share of revenue is worth calling out. */
const EXPENSE_HEAVY_SHARE = 0.35;

export type DemandSignal = "growing" | "steady" | "falling";
export type PricingSignal = "headroom" | "hold" | "reviewCosts";
export type ProfitSignal = "strong" | "healthy" | "thin" | "loss";

export type RecommendationKey =
  | "demandGrowing"
  | "demandSteady"
  | "demandFalling"
  | "pricingHeadroom"
  | "pricingHold"
  | "pricingReviewCosts"
  | "profitStrong"
  | "profitHealthy"
  | "profitThin"
  | "profitLoss"
  | "expenseHeavy";

/**
 * The worked figures behind the advice.
 *
 * Printed in the report as a short table so an accountant can check the
 * reasoning rather than take the prose on trust. Each one is a plain ratio of
 * two numbers already on the page — nothing here needs explaining beyond its
 * own label.
 */
export interface ReportMetrics {
  /** Orders per trading day across the period. */
  ordersPerDay: number;
  /** Net profit divided by order count — what one sale is really worth. */
  profitPerOrder: number;
  /** Gross profit as a share of revenue, before operating costs. */
  grossMargin: number;
  /** Net profit as a share of revenue, after everything. */
  netMargin: number;
  /** Operating costs as a share of revenue. */
  expenseRatio: number;
  /** Cost of goods as a share of revenue — the food cost every kitchen tracks. */
  foodCostRatio: number;
  /** Revenue needed to cover operating costs at the current gross margin. */
  breakEvenRevenue: number;
  /** Orders needed to reach that figure at the current average ticket. */
  breakEvenOrders: number;
  /** Change in order volume, second half of the period against the first. */
  demandChange: number;
}

export interface ReportInsights {
  demand: DemandSignal;
  pricing: PricingSignal;
  profit: ProfitSignal;
  /** Ordered sentence keys the report renders as a paragraph. */
  recommendations: RecommendationKey[];
  metrics: ReportMetrics;
}

export interface InsightInput {
  orders: number;
  averageOrderValue: number;
  revenue: number;
  netProfit: number;
  margin: number;
  expenses: number;
  days: number;
  daily: DayPoint[];
  /** Cost of goods sold. Optional so existing callers keep working. */
  cost?: number;
  grossProfit?: number;
}

/** Guards every ratio in this module against a zero denominator. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Order-volume direction, measured half-over-half across the period.
 *
 * Compares the two halves of the daily series rather than first day against
 * last: single days swing wildly on weather and holidays, and one freak
 * Thursday should not be reported to an owner as a trend.
 */
function demandChange(daily: DayPoint[]): number {
  if (daily.length < 4) return 0;

  const midpoint = Math.floor(daily.length / 2);
  const sum = (points: DayPoint[]) =>
    points.reduce((total, point) => total + point.orders, 0);

  const earlier = sum(daily.slice(0, midpoint));
  const later = sum(daily.slice(midpoint));

  if (earlier === 0) return later > 0 ? 1 : 0;
  return (later - earlier) / earlier;
}

function demandTrend(daily: DayPoint[]): DemandSignal {
  if (daily.length < 4) return "steady";

  const change = demandChange(daily);
  if (change > TREND_DEADBAND) return "growing";
  if (change < -TREND_DEADBAND) return "falling";
  return "steady";
}

function profitBand(margin: number, netProfit: number): ProfitSignal {
  if (netProfit < 0) return "loss";
  if (margin >= MARGIN_STRONG) return "strong";
  if (margin >= MARGIN_HEALTHY) return "healthy";
  return "thin";
}

/**
 * Whether the average ticket looks under-priced.
 *
 * The judgement is the pairing, not either number alone: steady or rising
 * demand alongside a margin that is not converting says the venue can ask for
 * a little more, while thin margins on falling demand point at the cost base
 * instead — raising prices into a shrinking room loses the remaining covers.
 */
function pricingPosition(demand: DemandSignal, profit: ProfitSignal): PricingSignal {
  const strained = profit === "thin" || profit === "loss";
  if (!strained) return "hold";
  return demand === "falling" ? "reviewCosts" : "headroom";
}

export function deriveReportInsights(input: InsightInput): ReportInsights {
  const demand = demandTrend(input.daily);
  const profit = profitBand(input.margin, input.netProfit);
  const pricing = pricingPosition(demand, profit);

  // Order matters: the paragraph opens with what changed, then what it means
  // for pricing, then how the bottom line is holding up.
  const recommendations: RecommendationKey[] = [
    demand === "growing"
      ? "demandGrowing"
      : demand === "falling"
        ? "demandFalling"
        : "demandSteady",
    pricing === "headroom"
      ? "pricingHeadroom"
      : pricing === "reviewCosts"
        ? "pricingReviewCosts"
        : "pricingHold",
    profit === "loss"
      ? "profitLoss"
      : profit === "thin"
        ? "profitThin"
        : profit === "strong"
          ? "profitStrong"
          : "profitHealthy",
  ];

  // Only worth a fourth sentence when overheads are the thing to look at.
  if (input.revenue > 0 && input.expenses / input.revenue > EXPENSE_HEAVY_SHARE) {
    recommendations.push("expenseHeavy");
  }

  const cost = input.cost ?? 0;
  const grossProfit = input.grossProfit ?? input.revenue - cost;
  const grossMargin = ratio(grossProfit, input.revenue);

  // Break-even: how much revenue the current gross margin has to carry before
  // the operating costs are paid off. With no gross margin there is no level of
  // trade that covers them, which is reported as zero rather than infinity.
  const breakEvenRevenue = grossMargin > 0 ? Math.round(input.expenses / grossMargin) : 0;

  const metrics: ReportMetrics = {
    ordersPerDay: ratio(input.orders, input.days),
    profitPerOrder: Math.round(ratio(input.netProfit, input.orders)),
    grossMargin,
    netMargin: ratio(input.netProfit, input.revenue),
    expenseRatio: ratio(input.expenses, input.revenue),
    foodCostRatio: ratio(cost, input.revenue),
    breakEvenRevenue,
    breakEvenOrders:
      input.averageOrderValue > 0
        ? Math.ceil(breakEvenRevenue / input.averageOrderValue)
        : 0,
    demandChange: demandChange(input.daily),
  };

  return { demand, pricing, profit, recommendations, metrics };
}
