import type { Metadata } from "next";
import Link from "next/link";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getFinanceSummary, getProductProfitability } from "@/lib/analytics";
import { startOfDayInZone } from "@/lib/time";
import { formatMoney, formatPercent } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/charts";
import { cn } from "@/lib/utils";
import { ExpensesPanel } from "./expenses";
import { FinancialReportCard } from "./report-card";
import { ProfitTable } from "./profit-table";
import { ExportButton } from "@/components/export-button";

export const metadata: Metadata = { title: "مدیریت مالی" };
export const dynamic = "force-dynamic";

const RANGES = [30, 90, 365] as const;

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { restaurantId } = await requirePageTab("finance", "/dashboard/finance");
  const { t, locale } = await getI18n();

  const { range } = await searchParams;
  const days = RANGES.includes(Number(range) as (typeof RANGES)[number])
    ? Number(range)
    : 30;

  // The same window `getFinanceSummary` reports on, so the expense list below
  // it covers exactly the period the totals above it were computed from.
  const from = startOfDayInZone(new Date(), -(days - 1));

  const [summary, products, expenses] = await Promise.all([
    getFinanceSummary(restaurantId, days),
    getProductProfitability(restaurantId, days),
    prisma.expense.findMany({
      where: { restaurantId, occurredAt: { gte: from } },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
  ]);

  const profitable = summary.netProfit >= 0;
  const rangeLabels: Record<number, string> = {
    30: t.analytics.range30,
    90: t.analytics.range90,
    365: locale === "fa" ? "یک سال" : "One year",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t.finance.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{t.finance.subtitle}</p>
        </div>

        <nav
          aria-label={t.finance.title}
          className="flex gap-1 rounded-full bg-ink-100 p-1"
        >
          {RANGES.map((value) => (
            <Link
              key={value}
              href={`/dashboard/finance?range=${value}`}
              aria-current={days === value ? "true" : undefined}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-3.5 text-xs font-bold whitespace-nowrap transition-colors sm:flex-none",
                days === value
                  ? "bg-surface text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              {rangeLabels[value]}
            </Link>
          ))}
        </nav>

        {/* The P&L an accountant asks for, and the order rows to reconcile it
            against — both over the period currently selected. */}
        <div className="flex flex-wrap gap-2">
          <ExportButton dataset="pnl" days={days} />
          <ExportButton dataset="orders" days={days} variant="ghost" />
        </div>
      </header>

      {/* Headline P&L — the number an owner actually opens this page for. */}
      <section
        className={cn(
          "rounded-[var(--radius-lg)] border p-6 text-center",
          profitable ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
        )}
      >
        <p className="text-sm font-bold text-ink-600">
          {profitable ? t.finance.netProfit : t.finance.netLoss}
        </p>
        <p
          className={cn(
            "mt-1 text-4xl font-black",
            profitable ? "text-emerald-700" : "text-red-700",
          )}
        >
          {formatMoney(Math.abs(summary.netProfit), locale)}
          <span className="ms-2 text-base font-bold opacity-70">{t.common.toman}</span>
        </p>
        <p className="mt-1.5 text-xs font-semibold text-ink-500">
          {t.finance.margin} {formatPercent(summary.margin, locale)}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t.finance.totalRevenue}
          value={formatMoney(summary.revenue, locale)}
          tone="brand"
        />
        <StatTile label={t.finance.totalCost} value={formatMoney(summary.cost, locale)} />
        <StatTile
          label={t.finance.grossProfit}
          value={formatMoney(summary.grossProfit, locale)}
          tone={summary.grossProfit >= 0 ? "positive" : "negative"}
        />
        <StatTile
          label={t.finance.totalExpenses}
          value={formatMoney(summary.expenses, locale)}
          tone="negative"
        />
      </section>

      <FinancialReportCard locale={locale} />

      {/* `[&>*]:min-w-0` is load-bearing: grid children default to
          `min-width: auto`, so the profit table's intrinsic width would widen
          the track and scroll the whole page sideways on a phone instead of
          scrolling inside its own container. */}
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <ExpensesPanel
          locale={locale}
          initialExpenses={expenses.map((expense) => ({
            id: expense.id,
            title: expense.title,
            category: expense.category,
            amount: expense.amount,
            note: expense.note,
            occurredAt: expense.occurredAt.toISOString(),
            isRecurring: expense.isRecurring,
          }))}
          byCategory={summary.expensesByCategory}
        />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t.finance.productProfit}</CardTitle>
              <p className="mt-1 text-xs text-ink-500">{t.finance.productProfitHint}</p>
            </div>
          </CardHeader>
          <CardBody className="!p-0">
            <ProfitTable
              locale={locale}
              rows={products
                .slice()
                .sort((a, b) => b.totalProfit - a.totalProfit)
                .slice(0, 30)}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
