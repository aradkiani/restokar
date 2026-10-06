import "server-only";
import { prisma } from "./prisma";
import {
  getCategoryBreakdown,
  getFinanceSummary,
  getRangeSummary,
  getTopProducts,
  rangeLengthInDays,
  siteRange,
  type DateRange,
  type DayPoint,
} from "./analytics";
import { zonedMidnight, zonedParts } from "./time";

/**
 * Composes the financial report from the *existing* reporting functions in
 * analytics.ts rather than querying independently.
 *
 * That is the point: the report and the on-screen dashboards are produced by
 * the same code, so a figure in the PDF can never disagree with the figure the
 * owner saw on the finance page. Every underlying function is already scoped by
 * restaurantId, so this inherits tenant isolation rather than re-implementing it.
 */

export type ReportPreset = "month" | "quarter" | "custom";

export interface ReportPeriod {
  preset: ReportPreset;
  from: Date;
  to: Date;
  days: number;
}

/**
 * Midnight on the 1st of a month, in the venue's zone, with the month index
 * allowed to run past either end of the year.
 *
 * Anchored to `APP_TIME_ZONE` rather than the host. These boundaries are handed
 * to `resolveRange`, which re-anchors to the venue's day — so building them on
 * the host's calendar meant a UTC server produced a March window running from
 * 28 February to 1 April: 32 days, with one day counted in two months' P&L.
 */
function monthStart(year: number, month: number): Date {
  const zeroBased = month - 1;
  return zonedMidnight(
    year + Math.floor(zeroBased / 12),
    (((zeroBased % 12) + 12) % 12) + 1,
  );
}

/** A calendar month, 1-indexed, in the venue's zone. */
export function monthRange(year: number, month: number): DateRange {
  return {
    from: monthStart(year, month),
    // The instant before the next month opens — exact for every month length,
    // with no leap-year special case.
    to: new Date(monthStart(year, month + 1).getTime() - 1),
  };
}

/**
 * Three whole months *beginning* with the one given.
 *
 * The picker labels this the "starting month", so the window runs forward:
 * choosing Farvardin reports Farvardin, Ordibehesht and Khordad. It previously
 * ran backwards — three months ending at the selection — which meant an owner
 * picking the current month got a report largely about the past, and one
 * picking a future month got an empty one.
 *
 * `monthStart` normalises an overflowing month index, so a quarter starting in
 * month 11 or 12 rolls into the following year on its own.
 */
export function quarterRange(year: number, month: number): DateRange {
  return {
    from: monthStart(year, month),
    to: new Date(monthStart(year, month + 3).getTime() - 1),
  };
}

export interface ExpenseLine {
  id: string;
  title: string;
  category: string;
  amount: number;
  occurredAt: Date;
  isRecurring: boolean;
}

export interface ProductLine {
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
  shareOfRevenue: number;
}

export interface CategoryLine {
  name: string;
  quantity: number;
  revenue: number;
  shareOfRevenue: number;
}

export interface PeriodBucket {
  label: string;
  revenue: number;
  cost: number;
  expenses: number;
  orders: number;
  netProfit: number;
}

export interface FinancialReport {
  restaurant: { name: string; slug: string; logoUrl: string | null };
  period: ReportPeriod;
  generatedAt: Date;

  summary: {
    revenue: number;
    cost: number;
    grossProfit: number;
    expenses: number;
    /** Stock waste plus count shortage, less count surplus. From the ledger. */
    stockLosses: number;
    netProfit: number;
    margin: number;
    orders: number;
    averageOrderValue: number;
  };

  daily: DayPoint[];
  monthly: PeriodBucket[];
  products: ProductLine[];
  categories: CategoryLine[];
  expenses: ExpenseLine[];
  expensesByCategory: { category: string; amount: number; share: number }[];

  /** Headline observations for the management summary page. */
  highlights: {
    bestDay: DayPoint | null;
    worstDay: DayPoint | null;
    bestProduct: ProductLine | null;
    largestExpenseCategory: { category: string; amount: number } | null;
    /** Revenue change between the first and last month in the period. */
    revenueTrend: number | null;
  };
}

function shareOf(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

/** Groups the daily series into calendar months for the periodic analysis. */
function bucketByMonth(
  daily: DayPoint[],
  expenses: ExpenseLine[],
  locale: string,
): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket & { sort: string }>();

  const labelFor = (date: Date) =>
    new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
      year: "numeric",
      month: "long",
    }).format(date);

  for (const point of daily) {
    const date = new Date(`${point.date}T00:00:00`);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? {
      sort: key,
      label: labelFor(date),
      revenue: 0,
      cost: 0,
      expenses: 0,
      orders: 0,
      netProfit: 0,
    };
    bucket.revenue += point.revenue;
    bucket.cost += point.cost;
    bucket.orders += point.orders;
    buckets.set(key, bucket);
  }

  for (const expense of expenses) {
    // Keyed in the venue's zone, matching the daily series above. Read on the
    // host clock, an expense recorded just after midnight Tehran fell into the
    // previous month on a UTC server and vanished from the bucket it belonged to.
    const occurred = zonedParts(expense.occurredAt);
    const key = `${occurred.year}-${String(occurred.month).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    // An expense dated outside the order window still belongs to the period.
    if (!bucket) continue;
    bucket.expenses += expense.amount;
  }

  return [...buckets.values()]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(({ sort: _sort, ...bucket }) => ({
      ...bucket,
      netProfit: bucket.revenue - bucket.cost - bucket.expenses,
    }));
}

export async function buildFinancialReport(
  restaurantId: string,
  window: DateRange,
  preset: ReportPreset,
  locale: string,
): Promise<FinancialReport> {
  const range = await siteRange(restaurantId, window);

  const [restaurant, summary, finance, topProducts, categories, expenseRows] =
    await Promise.all([
      prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { name: true, slug: true, logoUrl: true },
      }),
      getRangeSummary(restaurantId, range),
      getFinanceSummary(restaurantId, range),
      getTopProducts(restaurantId, range, 500),
      getCategoryBreakdown(restaurantId, range),
      prisma.expense.findMany({
        where: {
          restaurantId,
          occurredAt: { gte: range.from, lte: range.to },
        },
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          title: true,
          category: true,
          amount: true,
          occurredAt: true,
          isRecurring: true,
        },
      }),
    ]);

  const products: ProductLine[] = topProducts
    .map((product) => ({
      name: product.name,
      quantity: product.quantity,
      revenue: product.revenue,
      profit: product.profit,
      shareOfRevenue: shareOf(product.revenue, summary.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const categoryLines: CategoryLine[] = categories.map((category) => ({
    name: category.name,
    quantity: category.quantity,
    revenue: category.revenue,
    shareOfRevenue: shareOf(category.revenue, summary.revenue),
  }));

  const monthly = bucketByMonth(summary.series, expenseRows, locale);

  const daysWithTrade = summary.series.filter((d) => d.orders > 0);
  const sortedByRevenue = [...daysWithTrade].sort((a, b) => b.revenue - a.revenue);

  const revenueTrend =
    monthly.length >= 2
      ? shareOf(
          monthly[monthly.length - 1]!.revenue - monthly[0]!.revenue,
          monthly[0]!.revenue,
        )
      : null;

  return {
    restaurant,
    period: {
      preset,
      from: range.from,
      to: range.to,
      days: rangeLengthInDays(range),
    },
    generatedAt: new Date(),

    summary: {
      revenue: summary.revenue,
      cost: summary.cost,
      grossProfit: summary.grossProfit,
      expenses: finance.expenses,
      stockLosses: finance.waste + finance.stockShortage - finance.stockSurplus,
      netProfit: finance.netProfit,
      margin: finance.margin,
      orders: summary.orders,
      averageOrderValue: summary.averageOrderValue,
    },

    daily: summary.series,
    monthly,
    products,
    categories: categoryLines,
    expenses: expenseRows,
    expensesByCategory: finance.expensesByCategory.map((entry) => ({
      ...entry,
      share: shareOf(entry.amount, finance.expenses),
    })),

    highlights: {
      bestDay: sortedByRevenue[0] ?? null,
      worstDay: sortedByRevenue[sortedByRevenue.length - 1] ?? null,
      bestProduct: products[0] ?? null,
      largestExpenseCategory: finance.expensesByCategory[0] ?? null,
      revenueTrend,
    },
  };
}
