import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { buildFinancialReport } from "@/lib/reports";
import { deriveReportInsights } from "@/lib/report-insights";
import { isWindowTooWide, resolveReportWindow } from "@/lib/report-range";
import { ReportQuerySchema } from "@/lib/validation";
import {
  formatDate,
  formatDateShort,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { RankedBars, TrendChart } from "@/components/charts";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "گزارش مالی" };
export const dynamic = "force-dynamic";

/**
 * The printable financial report.
 *
 * Rendered as a paginated HTML document that the browser turns into a PDF via
 * its own print pipeline, rather than being drawn by a server-side PDF library.
 * That is a deliberate choice: pdfkit, jsPDF and pdf-lib have no Arabic/Persian
 * glyph shaping or bidi support, so Persian text comes out as disconnected
 * letters in the wrong order — unusable for the primary audience. Headless
 * Chrome would shape correctly but costs a ~170MB binary and is unreliable to
 * fetch from Iran, against this project's dependency-light, sanction-safe
 * constraints. The browser already does perfect Persian shaping for free.
 */
export default async function FinancialReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The finance section, like the finance page and /api/reports/financial —
  // a staff member granted finance used to see the figures but be sent away
  // from their printable report.
  const { restaurantId } = await requirePageTab("finance", "/dashboard/finance/report");
  const { t, locale } = await getI18n();

  const raw = await searchParams;
  const parsed = ReportQuerySchema.safeParse({
    preset: raw.preset,
    from: raw.from,
    to: raw.to,
    year: raw.year,
    month: raw.month,
    // Must be forwarded: dropping it would resolve the anchor as Gregorian
    // here while the preview resolved it as Jalali, and the document would
    // report a different month from the one the owner previewed.
    calendar: raw.calendar,
  });

  // A malformed query falls back to the current month rather than erroring:
  // this page is reached by a link, and a broken link should still print.
  const query = parsed.success ? parsed.data : ReportQuerySchema.parse({});
  const { range, preset } = resolveReportWindow(query);

  if (isWindowTooWide(range)) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center">
        <p className="text-sm font-semibold text-red-700">{t.report.noData}</p>
      </main>
    );
  }

  const report = await buildFinancialReport(restaurantId, range, preset, locale);
  const hasData = report.summary.orders > 0 || report.expenses.length > 0;

  // Reads the figures above and decides which recommendations to print. The
  // ratios behind it stay here — the document shows the conclusion, not the
  // arithmetic that produced it.
  const insights = deriveReportInsights({
    orders: report.summary.orders,
    averageOrderValue: report.summary.averageOrderValue,
    revenue: report.summary.revenue,
    netProfit: report.summary.netProfit,
    margin: report.summary.margin,
    expenses: report.summary.expenses,
    days: report.period.days,
    daily: report.daily,
    cost: report.summary.cost,
    grossProfit: report.summary.grossProfit,
  });

  const money = (value: number) => formatMoney(value, locale);
  const periodLabel = `${formatDate(report.period.from, locale)} — ${formatDate(report.period.to, locale)}`;

  return (
    <div className="report-doc mx-auto max-w-[820px] bg-white text-ink-900">
      {/* Screen-only toolbar; excluded from the printed document. */}
      <div className="no-print sticky top-0 z-10 mb-6 flex items-center justify-between gap-3 border-b border-ink-200 bg-white/95 px-5 py-3 backdrop-blur">
        <p className="text-sm font-bold">{t.report.title}</p>
        <PrintButton label={t.report.print} />
      </div>

      <div className="px-8 pb-10">
        {/* ------------------------------------------------------ 1. cover */}
        <section className="report-cover flex min-h-[60vh] flex-col justify-center border-b border-ink-200 pb-10 text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-brand-700 uppercase">
            {t.common.appName}
          </p>
          <h1 className="mt-5 text-4xl font-black">{report.restaurant.name}</h1>
          <p className="mt-3 text-xl font-bold text-ink-600">{t.report.coverTitle}</p>

          <dl className="mx-auto mt-10 grid w-full max-w-sm gap-2 text-sm">
            <div className="flex justify-between border-b border-ink-100 pb-2">
              <dt className="text-ink-500">{t.report.reportingPeriod}</dt>
              <dd className="font-semibold">{periodLabel}</dd>
            </div>
            <div className="flex justify-between border-b border-ink-100 pb-2">
              <dt className="text-ink-500">{t.report.days}</dt>
              <dd className="font-semibold tabular-nums">
                {formatNumber(report.period.days, locale)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">{t.report.generatedAt}</dt>
              <dd className="font-semibold">{formatDate(report.generatedAt, locale)}</dd>
            </div>
          </dl>
        </section>

        {!hasData ? (
          <section className="py-20 text-center">
            <p className="text-base font-bold text-ink-800">{t.report.noData}</p>
            <p className="mt-2 text-sm text-ink-500">{t.report.noDataHint}</p>
          </section>
        ) : (
          <>
            {/* -------------------------------------------- 2. summary */}
            <ReportSection title={t.report.sectionSummary} note={t.report.explainSummary}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Figure
                  label={t.finance.totalRevenue}
                  value={money(report.summary.revenue)}
                />
                <Figure label={t.finance.totalCost} value={money(report.summary.cost)} />
                <Figure
                  label={t.finance.grossProfit}
                  value={money(report.summary.grossProfit)}
                />
                <Figure
                  label={t.finance.totalExpenses}
                  value={money(report.summary.expenses)}
                />
                <Figure
                  label={
                    report.summary.netProfit >= 0
                      ? t.finance.netProfit
                      : t.finance.netLoss
                  }
                  value={money(Math.abs(report.summary.netProfit))}
                  tone={report.summary.netProfit >= 0 ? "positive" : "negative"}
                />
                <Figure
                  label={t.finance.margin}
                  value={formatPercent(report.summary.margin, locale)}
                />
                <Figure
                  label={t.analytics.orders}
                  value={formatNumber(report.summary.orders, locale)}
                />
                <Figure
                  label={t.analytics.avgOrderValue}
                  value={money(report.summary.averageOrderValue)}
                />
              </div>
            </ReportSection>

            {/* ------------------------------------------ 2b. insights */}
            <ReportSection
              title={t.report.sectionInsights}
              note={t.report.explainInsights}
            >
              {/* The worked figures come first: the prose that follows refers to
                  them, and an owner checking the reasoning should not have to
                  take the conclusions on trust. */}
              <p className="mb-2 text-sm font-bold text-ink-800">
                {t.report.metricsTitle}
              </p>
              <ChartNote>{t.report.metricsHint}</ChartNote>

              <ReportTable
                head={[t.report.metricsTitle, t.report.expenseAmount, ""]}
                rows={[
                  [
                    t.report.metricOrdersPerDay,
                    formatNumber(insights.metrics.ordersPerDay, locale),
                    "",
                  ],
                  [
                    t.report.metricProfitPerOrder,
                    money(insights.metrics.profitPerOrder),
                    "",
                  ],
                  [
                    t.report.metricGrossMargin,
                    formatPercent(insights.metrics.grossMargin, locale),
                    t.report.metricGrossMarginHint,
                  ],
                  [
                    t.report.metricNetMargin,
                    formatPercent(insights.metrics.netMargin, locale),
                    t.report.metricNetMarginHint,
                  ],
                  [
                    t.report.metricFoodCost,
                    formatPercent(insights.metrics.foodCostRatio, locale),
                    t.report.metricFoodCostHint,
                  ],
                  [
                    t.report.metricExpenseRatio,
                    formatPercent(insights.metrics.expenseRatio, locale),
                    t.report.metricExpenseRatioHint,
                  ],
                  [
                    t.report.metricBreakEven,
                    money(insights.metrics.breakEvenRevenue),
                    t.report.metricBreakEvenHint,
                  ],
                  [
                    t.report.metricBreakEvenOrders,
                    formatNumber(insights.metrics.breakEvenOrders, locale),
                    "",
                  ],
                ]}
              />

              <div className="mt-5 space-y-2.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50/60 p-4 text-sm leading-7 text-ink-800">
                {insights.recommendations.map((key) => (
                  <p key={key}>{t.report.advice[key]}</p>
                ))}
              </div>
            </ReportSection>

            {/* ---------------------------------------------- 3. sales */}
            <ReportSection title={t.report.sectionSales} note={t.report.explainSales}>
              <ChartNote>{t.report.explainSalesTrend}</ChartNote>
              <TrendChart
                locale={locale}
                emptyLabel={t.analytics.noData}
                ariaLabel={t.analytics.salesTrendChart}
                points={report.daily.map((point) => ({
                  label: formatDateShort(new Date(`${point.date}T00:00:00`), locale),
                  value: point.revenue,
                  secondary: point.orders,
                }))}
              />
            </ReportSection>

            {/* -------------------------------------------- 4. products */}
            <ReportSection
              title={t.report.sectionProducts}
              note={t.report.explainProducts}
            >
              <ReportTable
                head={[
                  t.report.product,
                  t.report.quantity,
                  t.report.revenueCol,
                  t.report.shareCol,
                  t.report.profitCol,
                ]}
                rows={report.products
                  .slice(0, 40)
                  .map((product) => [
                    product.name,
                    formatNumber(product.quantity, locale),
                    money(product.revenue),
                    formatPercent(product.shareOfRevenue, locale),
                    money(product.profit),
                  ])}
              />
            </ReportSection>

            {/* ------------------------------------------ 5. categories */}
            <ReportSection
              title={t.report.sectionCategories}
              note={t.report.explainCategories}
            >
              <ReportTable
                head={[
                  t.dashboard.categories,
                  t.report.quantity,
                  t.report.revenueCol,
                  t.report.shareCol,
                ]}
                rows={report.categories.map((category) => [
                  category.name,
                  formatNumber(category.quantity, locale),
                  money(category.revenue),
                  formatPercent(category.shareOfRevenue, locale),
                ])}
              />
            </ReportSection>

            {/* -------------------------------------------- 6. expenses */}
            <ReportSection
              title={t.report.sectionExpenses}
              note={t.report.explainExpenses}
            >
              <p className="mb-2 text-xs font-bold text-ink-600">
                {t.report.totalsByCategory}
              </p>
              <ReportTable
                head={[t.report.expenseType, t.report.expenseAmount, t.report.shareCol]}
                rows={report.expensesByCategory.map((entry) => [
                  t.finance.categories[
                    entry.category as keyof typeof t.finance.categories
                  ] ?? entry.category,
                  money(entry.amount),
                  formatPercent(entry.share, locale),
                ])}
              />

              <div className="mt-5">
                <ReportTable
                  head={[
                    t.report.expenseTitle,
                    t.report.expenseType,
                    t.report.expenseAmount,
                    t.report.expenseDate,
                  ]}
                  rows={report.expenses.map((expense) => [
                    expense.title,
                    t.finance.categories[
                      expense.category as keyof typeof t.finance.categories
                    ] ?? expense.category,
                    money(expense.amount),
                    formatDate(expense.occurredAt, locale),
                  ])}
                />
              </div>
            </ReportSection>

            {/* ------------------------------------------- 7. P&L ------ */}
            <ReportSection
              title={t.report.sectionProfitLoss}
              note={t.report.explainProfitLoss}
            >
              <ReportTable
                head={["", t.report.expenseAmount]}
                rows={[
                  [t.finance.totalRevenue, money(report.summary.revenue)],
                  [`− ${t.finance.totalCost}`, money(report.summary.cost)],
                  [`= ${t.finance.grossProfit}`, money(report.summary.grossProfit)],
                  [`− ${t.finance.totalExpenses}`, money(report.summary.expenses)],
                  [
                    `= ${report.summary.netProfit >= 0 ? t.finance.netProfit : t.finance.netLoss}`,
                    money(Math.abs(report.summary.netProfit)),
                  ],
                ]}
                emphasiseLastRow
              />
            </ReportSection>

            {/* -------------------------------------------- 8. periodic */}
            <ReportSection
              title={t.report.sectionPeriodic}
              note={t.report.explainPeriodic}
            >
              <ReportTable
                head={[
                  t.report.month_,
                  t.analytics.orders,
                  t.report.revenueCol,
                  t.finance.totalExpenses,
                  t.report.netProfitCol,
                ]}
                rows={report.monthly.map((bucket) => [
                  bucket.label,
                  formatNumber(bucket.orders, locale),
                  money(bucket.revenue),
                  money(bucket.expenses),
                  money(bucket.netProfit),
                ])}
              />
            </ReportSection>

            {/* ---------------------------------------------- 9. charts */}
            <ReportSection title={t.report.sectionCharts} note={t.report.explainCharts}>
              <div className="space-y-6">
                <ChartBlock
                  title={t.report.profitTrendChart}
                  description={t.report.explainProfitTrend}
                >
                  <TrendChart
                    locale={locale}
                    emptyLabel={t.analytics.noData}
                    ariaLabel={t.report.profitTrendChart}
                    points={report.monthly.map((bucket) => ({
                      label: bucket.label,
                      value: bucket.netProfit,
                      secondary: bucket.orders,
                    }))}
                  />
                </ChartBlock>

                <ChartBlock
                  title={t.report.categoryChart}
                  description={t.report.explainCategoryChart}
                >
                  <RankedBars
                    locale={locale}
                    emptyLabel={t.analytics.noData}
                    maxRows={8}
                    data={report.categories.map((category) => ({
                      label: category.name,
                      value: category.revenue,
                      meta: `${formatNumber(category.quantity, locale)} ${t.analytics.units}`,
                    }))}
                  />
                </ChartBlock>

                <ChartBlock
                  title={t.report.topProductsChart}
                  description={t.report.explainTopProductsChart}
                >
                  <RankedBars
                    locale={locale}
                    emptyLabel={t.analytics.noData}
                    maxRows={8}
                    data={report.products.slice(0, 8).map((product) => ({
                      label: product.name,
                      value: product.revenue,
                      meta: `${formatNumber(product.quantity, locale)} ${t.analytics.units}`,
                    }))}
                  />
                </ChartBlock>
              </div>
            </ReportSection>

            {/* ----------------------------------------- 10. management */}
            <ReportSection
              title={t.report.sectionManagement}
              note={t.report.explainManagement}
            >
              <ul className="space-y-2.5 text-sm">
                {report.highlights.bestDay && (
                  <Highlight
                    label={t.report.bestDay}
                    value={`${formatDate(new Date(`${report.highlights.bestDay.date}T00:00:00`), locale)} — ${money(report.highlights.bestDay.revenue)}`}
                  />
                )}
                {report.highlights.worstDay && (
                  <Highlight
                    label={t.report.worstDay}
                    value={`${formatDate(new Date(`${report.highlights.worstDay.date}T00:00:00`), locale)} — ${money(report.highlights.worstDay.revenue)}`}
                  />
                )}
                {report.highlights.bestProduct && (
                  <Highlight
                    label={t.report.bestProduct}
                    value={`${report.highlights.bestProduct.name} — ${money(report.highlights.bestProduct.revenue)}`}
                  />
                )}
                {report.highlights.largestExpenseCategory && (
                  <Highlight
                    label={t.report.biggestExpense}
                    value={`${
                      t.finance.categories[
                        report.highlights.largestExpenseCategory
                          .category as keyof typeof t.finance.categories
                      ] ?? report.highlights.largestExpenseCategory.category
                    } — ${money(report.highlights.largestExpenseCategory.amount)}`}
                  />
                )}
                {report.highlights.revenueTrend !== null && (
                  <Highlight
                    label={t.report.revenueTrend}
                    value={formatPercent(report.highlights.revenueTrend, locale)}
                  />
                )}
              </ul>
            </ReportSection>
          </>
        )}

        <footer className="mt-10 border-t border-ink-200 pt-4 text-center text-xs text-ink-400">
          {report.restaurant.name} · {t.common.appName} ·{" "}
          {formatDate(report.generatedAt, locale)}
        </footer>
      </div>
    </div>
  );
}

/**
 * A section of the report, with the standing explanation of what it shows.
 *
 * This is an accounting document, and its readers are not accountants — it goes
 * to a landlord, an investor, or the owner's own tax adviser. A page of figures
 * with no prose forces every one of them to infer what "gross profit" excludes
 * or which orders a total counts.
 *
 * The text is a fixed template rather than commentary generated from the
 * numbers: it explains the *method*, which does not change between venues or
 * periods, and so cannot go stale or accidentally assert something untrue about
 * a particular month. The written interpretation of the figures themselves
 * already lives in the management summary.
 */
function ReportSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section mt-10">
      <h2 className="mb-4 border-b-2 border-brand-500 pb-1.5 text-lg font-black">
        {title}
      </h2>
      {note && (
        <p className="report-avoid-break mb-4 border-s-2 border-ink-200 ps-3 text-[13px] leading-7 text-ink-600">
          {note}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Sets a chart up before the reader meets it. A chart dropped in without a
 * sentence of context makes the reader guess what they are looking at, and any
 * accounting term inside it is glossed here in plain language.
 */
function ChartNote({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs leading-6 text-ink-600">{children}</p>;
}

function ChartBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="report-avoid-break">
      <p className="mb-1.5 text-sm font-bold text-ink-700">{title}</p>
      <ChartNote>{description}</ChartNote>
      {children}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-ink-900";

  return (
    <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 text-base font-black tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 pb-2">
      <span className="text-ink-500">{label}</span>
      <span className="font-bold">{value}</span>
    </li>
  );
}

function ReportTable({
  head,
  rows,
  emphasiseLastRow = false,
}: {
  head: string[];
  rows: string[][];
  emphasiseLastRow?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-300 text-xs text-ink-600">
            {head.map((cell, index) => (
              <th key={index} className="p-2 text-start font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={
                emphasiseLastRow && rowIndex === rows.length - 1
                  ? "font-black"
                  : undefined
              }
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`p-2 ${cellIndex === 0 ? "font-semibold" : "tabular-nums"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
