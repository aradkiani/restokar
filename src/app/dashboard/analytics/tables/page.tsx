import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, Lightbulb, QrCode, ShoppingBag, Wallet } from "lucide-react";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import {
  COMPARISON_PRESETS,
  isComparisonPreset,
  resolveComparison,
  type ComparisonPreset,
} from "@/lib/insight-periods";
import { dayKey } from "@/lib/analytics";
import { getTableReport } from "@/lib/tables-server";
import { assessTableConcentration, TABLE_THRESHOLDS } from "@/lib/tables";
import { buildTableInsights } from "@/lib/sales-insights";
import { ExportButton } from "@/components/export-button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { StatTile } from "@/components/charts";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InsightCard } from "../insights";
import { TablePerformanceTable } from "./table-performance";

/**
 * What is happening through each QR code.
 *
 * The screen the table intelligence layer exists to produce, and it lives under
 * analytics rather than beside the QR printing tools deliberately: everything on
 * it is money, so it sits behind the `analytics` grant. A staff account given
 * `qr` so it can print codes for new tables must not thereby learn what each
 * table takes.
 *
 * Reuses the comparison periods, the insight cards, the export engine and the
 * stat tiles the analytics page already has. The only thing built for this
 * screen is the performance table itself.
 */

export const metadata: Metadata = { title: "عملکرد میزها" };
export const dynamic = "force-dynamic";

/** The period this opens on, matching the analytics page's own default. */
const DEFAULT_PRESET: ComparisonPreset = "last30";

export default async function TableIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { restaurantId } = await requirePageTab(
    "analytics",
    "/dashboard/analytics/tables",
  );
  const { t, locale } = await getI18n();
  const copy = t.tableIntel;

  const { period } = await searchParams;
  const preset = period && isComparisonPreset(period) ? period : DEFAULT_PRESET;

  // The same windows the sales insights compare against, so a table's movement
  // and the venue's movement always describe the same two periods.
  const windows = resolveComparison(preset);
  const report = await getTableReport(restaurantId, windows);

  const insights = buildTableInsights({
    report,
    concentration: assessTableConcentration(report.rows),
  });

  const busiest = [...report.rows].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{copy.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/analytics"
            className="tap-safe inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink-100 px-3.5 text-xs font-bold text-ink-600 transition-colors hover:text-ink-900"
          >
            {/* Start-facing, so it points "back" in both directions. */}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            {copy.backToAnalytics}
          </Link>

          {/*
            The existing export engine, handed the explicit range this screen is
            showing rather than a rolling day count — the comparison presets are
            not all "the last N days", and exporting a different window from the
            one on screen is the failure that destroys trust in an export.
          */}
          <ExportButton
            dataset="tables"
            from={dayKey(windows.current.from)}
            to={dayKey(windows.current.to)}
          />
        </div>
      </header>

      {/* The same period control the insights section uses, so switching
          period here means what it means one screen over. */}
      <nav
        aria-label={t.insights.period}
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {COMPARISON_PRESETS.map((value) => (
          <Link
            key={value}
            href={`/dashboard/analytics/tables?period=${value}`}
            aria-current={preset === value ? "true" : undefined}
            className={cn(
              "tap-safe inline-flex min-h-10 items-center justify-center rounded-full px-3.5 text-xs font-bold whitespace-nowrap transition-colors",
              preset === value
                ? "bg-brand-600 text-white"
                : "bg-ink-100 text-ink-600 hover:text-ink-900",
            )}
          >
            {t.insights.periods[value]}
          </Link>
        ))}
      </nav>

      <p className="text-xs text-ink-500">
        <span className="font-semibold text-ink-700">
          {t.insights.currentRange
            .replace("{from}", formatDate(windows.current.from, locale))
            .replace("{to}", formatDate(windows.current.to, locale))}
        </span>
        {" · "}
        {t.insights.comparedWith
          .replace("{from}", formatDate(windows.previous.from, locale))
          .replace("{to}", formatDate(windows.previous.to, locale))}
      </p>

      {windows.incomplete && (
        <p className="rounded-[var(--radius-sm)] bg-ink-50 p-2.5 text-xs text-ink-600">
          {t.insights.incompleteNote}
        </p>
      )}

      {/*
        A venue with no tables at all is not short of data — it has not set the
        feature up. So it is pointed at the screen that does that, rather than
        shown an empty report it cannot fill.
      */}
      {report.totals.reportedTables === 0 ? (
        <EmptyState
          icon={<QrCode className="size-6" />}
          title={copy.empty}
          description={copy.emptyHint}
          action={
            <Link
              href="/dashboard/qr"
              className="tap-safe inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-brand-600 px-4 text-sm font-bold text-white"
            >
              {copy.emptyAction}
            </Link>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={copy.tiles.activeTables}
              value={formatNumber(report.totals.activeTables, locale)}
              icon={<QrCode className="size-4" />}
            />
            {/*
              The money tile takes the full width on a phone.

              A venue's table revenue over ninety days runs to ten digits —
              «۱٬۵۴۸٬۸۳۵٬۰۰۰ تومان» — and the Persian thousands separator offers
              no line-break opportunity, so in a half-width tile at 320px the
              figure is 151px of text in a 104px box and pushes the whole
              document sideways. Measured, not guessed. Spanning both columns
              gives it 288px and keeps the exact figure rather than rounding a
              headline number to fit.
            */}
            <div className="col-span-2 sm:col-span-1">
              <StatTile
                label={copy.tiles.tableRevenue}
                value={`${formatMoney(report.totals.revenue, locale)} ${t.common.toman}`}
                tone="brand"
                icon={<Wallet className="size-4" />}
              />
            </div>
            <StatTile
              label={copy.tiles.tableOrders}
              value={formatNumber(report.totals.orders, locale)}
              icon={<ShoppingBag className="size-4" />}
            />
            <StatTile
              label={copy.tiles.busiest}
              value={
                busiest && busiest.orders > 0
                  ? `${copy.columns.table} ${busiest.number}`
                  : "—"
              }
              hint={
                busiest && busiest.orders > 0
                  ? `${formatMoney(busiest.revenue, locale)} ${t.common.toman}`
                  : undefined
              }
              icon={<Eye className="size-4" />}
            />
          </section>

          {/*
            Findings first, then the table they came from — the same order the
            analytics page puts its insights and its product table in.
          */}
          <Card>
            <CardHeader>
              {/* No subtitle: the page header directly above already carries
                  it, and printing the same sentence twice on one screen reads
                  as a rendering fault. */}
              <CardTitle>{t.insights.title}</CardTitle>
            </CardHeader>

            <CardBody className="space-y-4">
              {/*
                The bands' own gate, stated plainly. An owner whose venue is too
                quiet for "busy" and "quiet" to mean anything is told what would
                make them appear, rather than left with a column of dashes.
              */}
              {report.activityStatus === "insufficientData" && (
                <p className="rounded-[var(--radius-sm)] bg-ink-50 p-2.5 text-xs text-ink-600">
                  <span className="font-semibold">{copy.insufficientBands}</span>{" "}
                  {copy.insufficientBandsHint
                    .replace(
                      "{orders}",
                      formatNumber(TABLE_THRESHOLDS.minOrdersForBands, locale),
                    )
                    .replace(
                      "{tables}",
                      formatNumber(TABLE_THRESHOLDS.minTablesForBands, locale),
                    )}
                </p>
              )}

              {insights.length === 0 ? (
                <EmptyState
                  icon={<Lightbulb className="size-6" />}
                  title={
                    report.totals.orders === 0 ? copy.noActivity : t.insights.noChange
                  }
                  description={
                    report.totals.orders === 0
                      ? copy.noActivityHint
                      : t.insights.noChangeHint
                  }
                />
              ) : (
                <ul className="space-y-2.5">
                  {insights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      locale={locale}
                      copy={t.insights}
                    />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <TablePerformanceTable report={report} locale={locale} t={t} />

          {/*
            Why the visit columns are missing, when they are.

            Said once, under the table, rather than repeated per row. The
            distinction it draws — a menu opened through this table's code, not
            a scan and not a person — is the whole honesty of the feature.
          */}
          <Card>
            <CardHeader>
              <CardTitle>{copy.visitsTitle}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {report.views.status === "measured" ? (
                <p className="text-sm text-ink-700">
                  {copy.visitsMeasured
                    .replace(
                      "{attributed}",
                      formatNumber(report.views.attributed, locale),
                    )
                    .replace(
                      "{unattributed}",
                      formatNumber(report.views.unattributed, locale),
                    )}
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-ink-700">
                    {copy.visitsInsufficient}
                  </p>
                  <p className="text-xs text-ink-500">{copy.visitsInsufficientHint}</p>
                </>
              )}
              <p className="text-xs text-ink-500">{copy.visitsNote}</p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
