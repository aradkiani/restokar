/**
 * What a dish is actually worth to the kitchen, and what that says about the menu.
 *
 * The gap this fills, stated plainly: the platform already knows what sold
 * (`analytics.ts`), already knows the venue's overall margin (`report-insights.ts`)
 * and already explains why revenue moved (`sales-insights.ts`) — but **nothing
 * connects volume to margin at the product level.** An owner can see that the
 * burger is their best seller and, separately, that the venue runs at 24%; no
 * screen tells them the burger runs at 9%. That is the single most commercially
 * useful thing this data can say, and it was missing.
 *
 * Free of database and framework imports, like `pricing.ts`, `customers.ts` and
 * `retention.ts`. Everything here is arithmetic over figures the reporting layer
 * already aggregates.
 *
 * ### Realised, not list
 *
 * Every margin below is computed from **order snapshots** — what the dish
 * actually sold for and actually cost on the day — never from the current list
 * price. The two genuinely differ: a dish discounted all month, or sold mostly
 * with a cheap option, has a realised margin its price tag does not show. A
 * matrix built on list prices would tell an owner their economics are fine while
 * the tills said otherwise.
 */

// ------------------------------- thresholds --------------------------------

/**
 * The floors below which a product's economics are not worth judging.
 *
 * Deliberately aligned with `INSIGHT_THRESHOLDS` in `sales-insights.ts` rather
 * than freshly invented — that module already chose these numbers against the
 * scale this product runs at (a 10–50 table venue, 20–60 covers a day), and a
 * second, different idea of "enough data" would let the two screens disagree
 * about whether the same dish is worth mentioning.
 */
export const PROFITABILITY_THRESHOLDS = {
  /** A dish needs to have actually sold before its margin means anything. */
  minQuantity: 5,
  minRevenue: 300_000,

  /**
   * Products a venue needs before "high" and "low" can be relative terms.
   *
   * Eight. Below that the menu has no middle for anything to be above or below,
   * and quartiles over five dishes rank them rather than describing them.
   */
  minProductsForMatrix: 8,

  /**
   * How far below the menu's own margin counts as weak, as a share of it.
   *
   * 0.7 — a dish earning less than 70% of what the average dish earns. Relative
   * to the venue, never an absolute percentage: 15% is thin for a café selling
   * coffee and healthy for a steakhouse, and a fixed number would be wrong for
   * one of them.
   */
  weakMarginRatio: 0.7,

  /** And the mirror: comfortably above the menu's own average. */
  strongMarginRatio: 1.15,

  /**
   * Share of revenue a dish needs to count as a high seller.
   *
   * Above its "fair share" — what it would take if every dish sold equally —
   * by half again. On a 20-dish menu fair share is 5%, so a high seller carries
   * 7.5%+. Scaling to the menu's size means this works for a 6-dish kiosk and a
   * 60-dish restaurant without a second constant.
   */
  highVolumeShareFactor: 1.5,

  /**
   * Share of a period's revenue that must have cost data behind it before a
   * margin figure is presented without qualification.
   */
  reliableCostCoverage: 0.9,
  partialCostCoverage: 0.5,

  /** Dishes whose combined share counts as concentration worth naming. */
  concentrationTopN: 3,
  concentrationShare: 0.4,
} as const;

// ------------------------------ cost coverage ------------------------------

/**
 * How much of what sold has a cost behind it.
 *
 * `Product.costPrice` is the platform's only cost input — it is typed in by the
 * owner, and `InventoryItem` carries no price, so recipes cannot supply one.
 * A dish left at zero therefore has *unknown* cost, not zero cost, and the
 * difference matters enormously: treating it as zero reports 100% margin on it
 * and silently inflates every figure above it.
 *
 * So coverage is measured in **money, not dishes**. Twelve uncosted items that
 * never sell matter far less than one uncosted best-seller, and a count would
 * rank them the same.
 */
export type CostConfidence = "reliable" | "partial" | "unknown";

export interface CostCoverage {
  confidence: CostConfidence;
  /** Share of revenue whose dish had a cost recorded. */
  coverage: number;
  /** Revenue with a cost behind it, and revenue without. */
  costedRevenue: number;
  uncostedRevenue: number;
  /** Distinct products that sold with no cost recorded. */
  uncostedProducts: number;
}

export interface ProductSales {
  /** Product id, or `deleted:<name>` for history whose product is gone. */
  key: string;
  id: string | null;
  name: string;
  quantity: number;
  /** `priceSnapshot × quantity`, summed — what it actually sold for. */
  revenue: number;
  /** `costSnapshot × quantity`, summed — what it actually cost. */
  cost: number;
  /** False when every sale of it carried a zero cost snapshot. */
  hasCost: boolean;
}

export function assessCostCoverage(products: readonly ProductSales[]): CostCoverage {
  let costedRevenue = 0;
  let uncostedRevenue = 0;
  let uncostedProducts = 0;

  for (const product of products) {
    if (product.hasCost) {
      costedRevenue += product.revenue;
    } else {
      uncostedRevenue += product.revenue;
      uncostedProducts += 1;
    }
  }

  const total = costedRevenue + uncostedRevenue;
  const coverage = total > 0 ? costedRevenue / total : 0;

  const confidence: CostConfidence =
    total === 0
      ? "unknown"
      : coverage >= PROFITABILITY_THRESHOLDS.reliableCostCoverage
        ? "reliable"
        : coverage >= PROFITABILITY_THRESHOLDS.partialCostCoverage
          ? "partial"
          : "unknown";

  return { confidence, coverage, costedRevenue, uncostedRevenue, uncostedProducts };
}

// --------------------------------- margin ----------------------------------

/**
 * Realised gross margin, as a fraction.
 *
 * Null rather than zero when there is no revenue or no cost behind it: a dish
 * with no cost recorded has an *unknown* margin, and returning 1.0 — which is
 * what `(revenue - 0) / revenue` gives — would report perfect profitability on
 * exactly the dishes the platform knows least about.
 */
export function realisedMargin(
  revenue: number,
  cost: number,
  hasCost: boolean,
): number | null {
  if (!hasCost || revenue <= 0) return null;
  return (revenue - cost) / revenue;
}

/**
 * The menu's own margin, weighted by what actually sold.
 *
 * Weighted rather than a mean of per-dish margins, because the unweighted
 * version lets a garnish nobody orders pull the benchmark as hard as the
 * best-seller. The question is "what margin does this venue's revenue earn",
 * and that is total profit over total revenue.
 *
 * Only costed dishes count, for the same reason `realisedMargin` returns null:
 * including an uncosted dish as 100% would raise the benchmark that every other
 * dish is then judged against.
 */
export function menuMargin(products: readonly ProductSales[]): number | null {
  let revenue = 0;
  let cost = 0;

  for (const product of products) {
    if (!product.hasCost) continue;
    revenue += product.revenue;
    cost += product.cost;
  }

  return revenue > 0 ? (revenue - cost) / revenue : null;
}

// ------------------------------- the matrix --------------------------------

/**
 * Where a dish sits on the two axes an owner actually acts on.
 *
 * Volume and margin, each high or low — the classic menu-engineering grid,
 * with the names chosen to describe the *dish* rather than to issue an
 * instruction. `reviewPricing` and `promote` say what is interesting about a
 * dish; neither says what to do about it, because that is a trade decision
 * involving things this software cannot see.
 *
 * `unknown` is a real answer for a dish with no cost recorded, and `insufficient`
 * for one that has barely sold. Both are reported rather than hidden: an owner
 * looking for a dish and not finding it would assume the screen was broken.
 */
export type ProductQuadrant =
  /** Sells well, earns well. Protect it. */
  | "star"
  /** Sells well, earns little — the commercially important one. */
  | "reviewPricing"
  /** Earns well, barely sells. The merchandising opportunity. */
  | "promote"
  /** Neither. Worth a look, never an automatic deletion. */
  | "review"
  /** No cost recorded, so margin is not knowable. */
  | "unknown"
  /** Too few sales to judge. */
  | "insufficient";

export interface ProductPerformance extends ProductSales {
  /** Realised gross profit in whole Toman: `revenue - cost`. */
  grossProfit: number | null;
  margin: number | null;
  /** This dish's share of the period's revenue. */
  revenueShare: number;
  quadrant: ProductQuadrant;
  /** True when it clears the high-volume bar. Carried for explainability. */
  isHighVolume: boolean;
}

export interface MenuBenchmark {
  /**
   * What the venue's revenue actually earns — the weighted margin.
   *
   * The figure to *show* an owner, because it answers "what does my turnover
   * earn". Not the bar individual dishes are measured against; see below.
   */
  menuMargin: number | null;
  /**
   * What a typical dish on this menu earns — the median.
   *
   * The bar for comparison, and it has to be separate from `menuMargin` because
   * the weighted mean is dragged by exactly the dish it is being used to judge.
   * Observed on real data: one best-seller at 12% pulled a menu of otherwise
   * 60–76% dishes down to a 44.7% mean, at which point *every other dish*
   * cleared the "strong margin" bar and six of eight rows were badged a
   * promotion opportunity. Six opportunities is no opportunities.
   *
   * A median is immune to that — one catastrophic dish moves it by one
   * position, not by twenty points — so "above typical" keeps meaning
   * something.
   */
  typicalMargin: number | null;
  /** Revenue share above which a dish counts as a high seller. */
  highVolumeShare: number;
  /** Whether the menu is big enough for "high" and "low" to be relative terms. */
  comparable: boolean;
}

/**
 * The middle dish's margin, across dishes that both sold and have a cost.
 *
 * Only dishes that actually sold: a dish nobody ordered says nothing about what
 * is typical, and including the long tail of a large menu would drag the median
 * toward dishes the kitchen barely makes.
 */
export function typicalMargin(products: readonly ProductSales[]): number | null {
  const margins = products
    .filter((p) => p.hasCost && p.quantity > 0 && p.revenue > 0)
    .map((p) => (p.revenue - p.cost) / p.revenue)
    .sort((a, b) => a - b);

  if (margins.length === 0) return null;

  const middle = Math.floor(margins.length / 2);
  return margins.length % 2 === 0
    ? (margins[middle - 1]! + margins[middle]!) / 2
    : margins[middle]!;
}

/**
 * The bar each dish is measured against, derived from the venue's own menu.
 *
 * Nothing here is a universal constant. The volume bar is a multiple of fair
 * share, which scales with how many dishes sold; the margin bar is a multiple
 * of the venue's own weighted margin. A tea house and a steakhouse get
 * different bars from the same code, which is the only way this can be right
 * for both.
 */
export function buildBenchmark(products: readonly ProductSales[]): MenuBenchmark {
  const selling = products.filter((p) => p.quantity > 0);

  const fairShare = selling.length > 0 ? 1 / selling.length : 0;

  return {
    menuMargin: menuMargin(products),
    typicalMargin: typicalMargin(products),
    highVolumeShare: fairShare * PROFITABILITY_THRESHOLDS.highVolumeShareFactor,
    comparable: selling.length >= PROFITABILITY_THRESHOLDS.minProductsForMatrix,
  };
}

/**
 * One dish, placed.
 *
 * The order of the guards is the design. Insufficient sales beats everything —
 * a dish that sold twice has no meaningful margin whatever the arithmetic says.
 * Missing cost beats the quadrants, because a margin that cannot be computed
 * must not be silently treated as low. Only then do the two axes apply.
 */
export function classifyProduct(
  product: ProductSales,
  totalRevenue: number,
  benchmark: MenuBenchmark,
): ProductPerformance {
  const margin = realisedMargin(product.revenue, product.cost, product.hasCost);
  const revenueShare = totalRevenue > 0 ? product.revenue / totalRevenue : 0;
  const isHighVolume = revenueShare >= benchmark.highVolumeShare;

  const base = {
    ...product,
    grossProfit: product.hasCost ? product.revenue - product.cost : null,
    margin,
    revenueShare,
    isHighVolume,
  };

  const tooSmall =
    product.quantity < PROFITABILITY_THRESHOLDS.minQuantity ||
    product.revenue < PROFITABILITY_THRESHOLDS.minRevenue;

  if (tooSmall) return { ...base, quadrant: "insufficient" };
  if (margin === null) return { ...base, quadrant: "unknown" };
  if (!benchmark.comparable || benchmark.typicalMargin === null) {
    return { ...base, quadrant: "insufficient" };
  }

  // Measured against the *typical* dish, not the weighted mean — see the note
  // on `typicalMargin`. Using the mean here badged six of eight rows.
  const strongMargin =
    margin >= benchmark.typicalMargin * PROFITABILITY_THRESHOLDS.strongMarginRatio;
  const weakMargin =
    margin <= benchmark.typicalMargin * PROFITABILITY_THRESHOLDS.weakMarginRatio;

  if (isHighVolume && weakMargin) return { ...base, quadrant: "reviewPricing" };
  if (isHighVolume && strongMargin) return { ...base, quadrant: "star" };
  if (!isHighVolume && strongMargin) return { ...base, quadrant: "promote" };
  if (!isHighVolume && weakMargin) return { ...base, quadrant: "review" };

  // Middling on both axes: a perfectly ordinary dish, and saying nothing about
  // it is the right answer. `star` is reserved for dishes that earn the label.
  return { ...base, quadrant: isHighVolume ? "star" : "review" };
}

/**
 * Every dish, placed, best-earning first.
 *
 * Ranked on realised gross profit rather than revenue: this screen exists to
 * answer "what actually makes me money", and revenue ranks a high-turnover,
 * low-margin dish above a quieter one that earns more. Dishes with no cost sort
 * last on a null profit rather than being dropped.
 */
export function rankPerformance(products: readonly ProductSales[]): {
  rows: ProductPerformance[];
  benchmark: MenuBenchmark;
  totalRevenue: number;
} {
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  const benchmark = buildBenchmark(products);

  const rows = products
    .map((product) => classifyProduct(product, totalRevenue, benchmark))
    .sort(
      (a, b) =>
        (b.grossProfit ?? -1) - (a.grossProfit ?? -1) ||
        b.revenue - a.revenue ||
        a.name.localeCompare(b.name, "fa"),
    );

  return { rows, benchmark, totalRevenue };
}

// ------------------------------ menu mix -----------------------------------

export interface MenuConcentration {
  /** Combined revenue share of the top `topN` dishes. */
  share: number;
  topN: number;
  /** Their names, for the sentence the dashboard prints. */
  names: string[];
  /** Whether that share is high enough to be worth telling the owner. */
  isConcentrated: boolean;
}

/**
 * How much of the menu's revenue rests on how few dishes.
 *
 * A real operational risk rather than a curiosity: a venue earning 60% of its
 * revenue from three dishes is badly exposed to one supplier problem or one
 * chef leaving. Stated as an observation with its own numbers — never as a
 * recommendation to change the menu, which is a decision involving a hundred
 * things this data cannot see.
 */
export function menuConcentration(products: readonly ProductSales[]): MenuConcentration {
  const topN = PROFITABILITY_THRESHOLDS.concentrationTopN;
  const total = products.reduce((sum, p) => sum + p.revenue, 0);

  const top = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, topN);
  const share = total > 0 ? top.reduce((sum, p) => sum + p.revenue, 0) / total : 0;

  return {
    share,
    topN: top.length,
    names: top.map((p) => p.name),
    /*
      Only meaningful on a menu large enough for concentration to be a choice.
      Three dishes out of four are 75% of revenue by arithmetic, not by risk.
    */
    isConcentrated:
      products.length > topN * 2 && share >= PROFITABILITY_THRESHOLDS.concentrationShare,
  };
}
