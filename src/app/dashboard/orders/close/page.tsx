import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { dayKey, dayStart, shiftDay } from "@/lib/cash-close";
import { daySummary, getClose, recentCloses } from "@/lib/cash-close-server";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CloseForm } from "./close-form";

export const metadata: Metadata = { title: "بستن صندوق" };
export const dynamic = "force-dynamic";

/**
 * End of the day: the day's figures for this site, what the till should hold,
 * the cashier's count and the difference — plus the earlier closes.
 */
export default async function CashClosePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { restaurantId } = await requirePageTab("orders", "/dashboard/orders/close");
  const { t, locale } = await getI18n();
  const { day } = await searchParams;

  const start = dayStart(day);
  const key = dayKey(start);
  const isToday = key === dayKey(new Date());
  const [summary, existing, history] = await Promise.all([
    daySummary(restaurantId, start),
    getClose(restaurantId, start),
    recentCloses(restaurantId),
  ]);

  const copy = t.cashClose;
  const money = (value: number) => `${formatMoney(value, locale)} ${t.common.toman}`;
  const Prev = locale === "fa" ? ChevronRight : ChevronLeft;
  const Next = locale === "fa" ? ChevronLeft : ChevronRight;

  const figures: { label: string; value: string; tone?: "warn" | "muted" }[] = [
    { label: copy.orders, value: formatNumber(summary.orders, locale) },
    { label: copy.sales, value: money(summary.sales) },
    { label: copy.cashPaid, value: money(summary.cashPaid) },
    { label: copy.onlinePaid, value: money(summary.onlinePaid) },
    {
      label: copy.unpaid,
      value: `${money(summary.unpaidTotal)} (${formatNumber(summary.unpaidCount, locale)})`,
      tone: summary.unpaidCount > 0 ? "warn" : undefined,
    },
    {
      label: copy.canceled,
      value: `${money(summary.canceledTotal)} (${formatNumber(summary.canceledCount, locale)})`,
      tone: "muted",
    },
    {
      label: copy.refundsDue,
      value: money(summary.refundsDueTotal),
      tone: summary.refundsDueCount > 0 ? "warn" : "muted",
    },
    { label: copy.discounts, value: money(summary.discounts), tone: "muted" },
    { label: copy.tips, value: money(summary.tips), tone: "muted" },
    { label: copy.tax, value: money(summary.tax), tone: "muted" },
    { label: copy.serviceCharge, value: money(summary.serviceCharge), tone: "muted" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{copy.subtitle}</p>
        </div>
        <nav className="flex items-center gap-1" aria-label={copy.title}>
          <Link
            href={`/dashboard/orders/close?day=${shiftDay(start, -1)}`}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border border-ink-300 px-3 text-xs font-bold text-ink-700 hover:border-ink-400"
          >
            <Prev className="size-4" />
            {copy.prevDay}
          </Link>
          <span className="px-3 text-sm font-black text-ink-900">
            {isToday ? copy.today : formatDate(start, locale)}
          </span>
          {!isToday && (
            <Link
              href={`/dashboard/orders/close?day=${shiftDay(start, 1)}`}
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-ink-300 px-3 text-xs font-bold text-ink-700 hover:border-ink-400"
            >
              {copy.nextDay}
              <Next className="size-4" />
            </Link>
          )}
        </nav>
      </header>

      <Card>
        <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label}>
              <p className="text-xs text-ink-500">{figure.label}</p>
              <p
                className={cn(
                  "mt-0.5 text-sm font-black tabular-nums",
                  figure.tone === "warn"
                    ? "text-amber-700"
                    : figure.tone === "muted"
                      ? "text-ink-600"
                      : "text-ink-900",
                )}
              >
                {figure.value}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>

      {summary.unpaidCount > 0 && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {copy.unpaidHint.replace("{n}", formatNumber(summary.unpaidCount, locale))}
        </p>
      )}

      <CloseForm
        key={key}
        day={key}
        expectedCash={summary.expectedCash}
        existing={
          existing
            ? {
                countedCash: existing.countedCash,
                note: existing.note,
                closedBy: copy.closedBy
                  .replace("{who}", existing.closedByLabel)
                  .replace("{when}", formatDateTime(existing.closedAt, locale)),
              }
            : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{copy.history}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-500">{copy.historyEmpty}</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {history.map((row) => (
                <li
                  key={row.day}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"
                >
                  <Link
                    href={`/dashboard/orders/close?day=${row.day}`}
                    className="min-w-32 font-bold text-ink-900 hover:underline"
                  >
                    {formatDate(row.day, locale)}
                  </Link>
                  <span className="text-ink-600 tabular-nums">
                    {copy.countLine.replace(
                      "{n}",
                      formatNumber(row.summary.orders, locale),
                    )}
                  </span>
                  <span className="text-ink-600 tabular-nums">
                    {money(row.countedCash)}
                  </span>
                  <span
                    className={cn(
                      "ms-auto font-bold tabular-nums",
                      row.difference === 0
                        ? "text-emerald-700"
                        : row.difference > 0
                          ? "text-sky-700"
                          : "text-red-700",
                    )}
                  >
                    {row.difference === 0
                      ? copy.balanced
                      : `${row.difference > 0 ? copy.surplus : copy.shortage} ${money(Math.abs(row.difference))}`}
                  </span>
                  <a
                    href={`/print/close?day=${row.day}&auto=1`}
                    target="_blank"
                    rel="noopener"
                    aria-label={copy.print}
                    title={copy.print}
                    className="tap-safe rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <Printer className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
