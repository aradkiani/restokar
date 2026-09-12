import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import {
  getCategoryBreakdown,
  getHourlyDistribution,
  getRangeSummary,
  getTopProducts,
  resolveRange,
} from "@/lib/analytics";
import { getRecommendationPerformance } from "@/lib/recommendations-server";
import { getFeaturedPerformance } from "@/lib/featured-server";
import { getSalesInsights } from "@/lib/sales-insights-server";
import { prisma } from "@/lib/prisma";
import { isComparisonPreset, type ComparisonPreset } from "@/lib/insight-periods";
import { SalesInsightsSection } from "./insights";
import {
  formatDateShort,
  formatMoney,
  formatNumber,
  formatPercent,
  localizeDigits,
} from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ColumnChart, RankedBars, StatTile, TrendChart } from "@/components/charts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "گزارش فروش" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/** Which comparison the insights section opens on when nothing is chosen. */
const DEFAULT_INSIGHT_PRESET: ComparisonPreset = "last30";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; insights?: string }>;
}) {
  const { restaurantId } = await requirePageTab("analytics", "/dashboard/analytics");
  const { t, locale } = await getI18n();

  const { range, insights } = await searchParams;
  const days = RANGES.includes(Number(range) as (typeof RANGES)[number])
    ? Number(range)
    : 30;

  const preset =
    insights && isComparisonPreset(insights) ? insights : DEFAULT_INSIGHT_PRESET;

  /*
    Whether this venue owns the menu it serves.

    Merchandising telemetry is filed against the *menu owner* — a promotion
    belongs to the chain, not to the site that happened to render it — while the
    attributed order lines belong to the branch that took them. Read at a branch
    the two halves therefore describe different things, and the report would show
    real purchases against zero impressions and a 0% conversion rate.

    There is no per-branch impression data to show, so a branch is shown neither
    half rather than a table that cannot be reconciled. The chain owner sees the
    whole picture on their own analytics page.
  */
  const venue = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  const ownsItsMenu = !venue?.parentRestaurantId;

  const [
    summary,
    previous,
    topProducts,
    categories,
    hourly,
    recommendations,
    featured,
    insightResult,
  ] = await Promise.all([
    getRangeSummary(restaurantId, days),
    // The preceding window of equal length, for the period-over-period delta.
    getRangeSummary(restaurantId, days * 2),
    getTopProducts(restaurantId, days, 8),
    getCategoryBreakdown(restaurantId, days),
    getHourlyDistribution(restaurantId, days),
    // The same window every other figure on this page uses, so the upsell
    // numbers can be read against the sales they are part of.
    ownsItsMenu
      ? getRecommendationPerformance(restaurantId, resolveRange(days))
      : Promise.resolve([]),
    ownsItsMenu
      ? getFeaturedPerformance(restaurantId, resolveRange(days))
      : Promise.resolve([]),
    // Its own window, chosen separately: the tile deltas describe the chart's
    // range, while the insights answer "what changed lately?".
    getSalesInsights(restaurantId, preset),
  ]);

  const previousRevenue = previous.revenue - summary.revenue;
  const delta =
    previousRevenue > 0 ? (summary.revenue - previousRevenue) / previousRevenue : null;

  const rangeLabel: Record<number, string> = {
    7: t.analytics.range7,
    30: t.analytics.range30,
    90: t.analytics.range90,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t.analytics.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{t.analytics.subtitle}</p>
        </div>

        {/* Filters sit in one row above the charts. */}
        <nav
          aria-label={t.analytics.title}
          className="flex gap-1 rounded-full bg-ink-100 p-1"
        >
          {RANGES.map((value) => (
            <Link
              key={value}
              href={`/dashboard/analytics?range=${value}&insights=${preset}`}
              aria-current={days === value ? "true" : undefined}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-3.5 text-xs font-bold whitespace-nowrap transition-colors sm:flex-none",
                days === value
                  ? "bg-surface text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              {rangeLabel[value]}
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t.analytics.revenue}
          value={`${formatMoney(summary.revenue, locale)} ${t.common.toman}`}
          tone="brand"
          hint={
            delta !== null
              ? `${delta >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(delta), locale)} ${t.analytics.vsPrevious}`
              : undefined
          }
          icon={<Wallet className="size-4" />}
        />
        <StatTile
          label={t.analytics.orders}
          value={formatNumber(summary.orders, locale)}
          icon={<ShoppingBag className="size-4" />}
        />
        <StatTile
          label={t.analytics.avgOrderValue}
          value={`${formatMoney(summary.averageOrderValue, locale)} ${t.common.toman}`}
          icon={<Receipt className="size-4" />}
        />
        <StatTile
          label={t.analytics.grossProfit}
          value={`${formatMoney(summary.grossProfit, locale)} ${t.common.toman}`}
          tone={summary.grossProfit >= 0 ? "positive" : "negative"}
          icon={<TrendingUp className="size-4" />}
        />
      </section>

      {/* Directly under the headline figures: the tiles say what the numbers
          are, this says what changed and where the change sits. */}
      <SalesInsightsSection
        result={insightResult}
        preset={preset}
        range={days}
        locale={locale}
        t={t}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t.analytics.salesTrend}</CardTitle>
          <span className="text-xs font-semibold text-ink-500">{rangeLabel[days]}</span>
        </CardHeader>
        <CardBody>
          <TrendChart
            locale={locale}
            height={260}
            emptyLabel={t.analytics.noData}
            ariaLabel={t.analytics.salesTrendChart}
            points={summary.series.map((point) => ({
              label: formatDateShort(new Date(`${point.date}T00:00:00`), locale),
              value: point.revenue,
              secondary: point.orders,
            }))}
          />
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.analytics.topProducts}</CardTitle>
          </CardHeader>
          <CardBody>
            <RankedBars
              locale={locale}
              emptyLabel={t.analytics.noData}
              data={topProducts.map((product) => ({
                label: product.name,
                value: product.revenue,
                meta: `${formatNumber(product.quantity, locale)} ${t.analytics.units}`,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.analytics.categoryBreakdown}</CardTitle>
          </CardHeader>
          <CardBody>
            {/* Categorical colours here — each row is a distinct entity, and the
                direct labels satisfy the contrast relief rule. */}
            <RankedBars
              locale={locale}
              colorful
              emptyLabel={t.analytics.noData}
              data={categories.map((category) => ({
                label: category.name,
                value: category.revenue,
                meta: `${formatNumber(category.quantity, locale)} ${t.analytics.units}`,
              }))}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.analytics.hourlyDistribution}</CardTitle>
        </CardHeader>
        <CardBody>
          <ColumnChart
            locale={locale}
            emptyLabel={t.analytics.noData}
            data={hourly.map((hour) => ({
              // Digit-substituted rather than number-formatted: the colon is
              // part of the label, and Intl has no number to group here.
              label: localizeDigits(`${String(hour.hour).padStart(2, "0")}:00`, locale),
              value: hour.orders,
            }))}
          />
        </CardBody>
      </Card>

      {/*
        Merchandising performance.

        Rendered only once there is something to say, like the suggestion table
        below it: a venue that has never promoted a dish sees the analytics page
        exactly as it was rather than an empty table asking to be understood.
      */}
      {featured.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.featured.analyticsTitle}</CardTitle>
            <p className="mt-0.5 text-xs text-ink-500">{t.featured.analyticsHint}</p>
          </CardHeader>
          <CardBody>
            {/* Scrolls inside its own box on a narrow screen rather than
                widening the page — six numeric columns do not fit a phone. */}
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[38rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-start text-xs text-ink-500">
                    <th className="py-2 text-start font-semibold">
                      {t.featured.product}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.featured.impressions}
                    </th>
                    <th className="py-2 text-start font-semibold">{t.featured.views}</th>
                    <th className="py-2 text-start font-semibold">
                      {t.featured.addedToCart}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.featured.purchases}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.featured.revenue}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {featured.map((row) => (
                    <tr
                      key={row.productId}
                      className="border-b border-ink-100 last:border-0"
                    >
                      <td className="py-2.5 pe-3 font-semibold text-ink-800">
                        {row.productName}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.impressions, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.interactions, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.addedToCart, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.purchases, locale)}
                      </td>
                      <td className="py-2.5 font-semibold tabular-nums">
                        {formatMoney(row.revenue, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/*
        Upselling performance.

        Rendered only once there is something to say. A venue that has not
        configured any suggestions — which is every venue on the day this
        shipped — sees the analytics page exactly as it was, rather than an
        empty table asking to be understood.
      */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.recommendations.analyticsTitle}</CardTitle>
            <p className="mt-0.5 text-xs text-ink-500">
              {t.recommendations.analyticsHint}
            </p>
          </CardHeader>
          <CardBody>
            {/* Scrolls inside its own box on a narrow screen rather than
                widening the page — six numeric columns do not fit a phone. */}
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[38rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-start text-xs text-ink-500">
                    <th className="py-2 text-start font-semibold">
                      {t.recommendations.pair}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.recommendations.impressions}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.recommendations.addedToCart}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.recommendations.purchases}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.recommendations.conversion}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t.recommendations.revenue}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((row) => (
                    <tr
                      key={`${row.sourceProductId}-${row.recommendedProductId}`}
                      className="border-b border-ink-100 last:border-0"
                    >
                      <td className="py-2.5 pe-3">
                        <span className="font-semibold text-ink-800">
                          {row.recommendedName}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {row.sourceName}
                        </span>
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.impressions, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.addedToCart, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.purchases, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatPercent(row.conversionRate, locale)}
                      </td>
                      <td className="py-2.5 font-semibold tabular-nums">
                        {formatMoney(row.revenue, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
