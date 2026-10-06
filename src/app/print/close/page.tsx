import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { dayStart } from "@/lib/cash-close";
import { getClose } from "@/lib/cash-close-server";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { printCss } from "../shared";
import { AutoPrint } from "../table/auto-print";
import { businessTodayStart } from "@/lib/business-day-server";

export const metadata: Metadata = { title: "چاپ", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The end-of-day close as recorded, on the receipt roll: /print/close?day=… */
export default async function PrintClosePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; paper?: string; auto?: string }>;
}) {
  const query = await searchParams;
  const paper = query.paper === "58" ? "58" : "80";
  const { restaurantId } = await requirePageTab("orders", "/dashboard/orders/close");
  const start = dayStart(query.day, new Date(), await businessTodayStart(restaurantId));
  const [{ t, locale }, close, site] = await Promise.all([
    getI18n(),
    getClose(restaurantId, start),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
  ]);

  const copy = t.cashClose;
  if (!close || !site) {
    return (
      <main id="main" className="p-8 text-center text-sm">
        {copy.historyEmpty}
      </main>
    );
  }

  const money = (value: number) => formatMoney(value, locale);
  const s = close.summary;
  const rows: [string, string][] = [
    [copy.orders, formatNumber(s.orders, locale)],
    [copy.sales, money(s.sales)],
    [copy.cashPaid, money(s.cashPaid)],
    [copy.onlinePaid, money(s.onlinePaid)],
    [copy.unpaid, `${money(s.unpaidTotal)} (${formatNumber(s.unpaidCount, locale)})`],
    [
      copy.canceled,
      `${money(s.canceledTotal)} (${formatNumber(s.canceledCount, locale)})`,
    ],
    [copy.refundsDue, money(s.refundsDueTotal)],
    [copy.discounts, money(s.discounts)],
    [copy.tips, money(s.tips)],
    [copy.tax, money(s.tax)],
    [copy.serviceCharge, money(s.serviceCharge)],
  ];

  return (
    <>
      <style>{printCss(paper)}</style>
      {query.auto === "1" && <AutoPrint />}
      <main id="main" className="receipt" data-kind="bill">
        <header className="center">
          <p className="venue">{site.name}</p>
          <p>{copy.title}</p>
          <p className="small">{formatDate(start, locale)}</p>
        </header>
        <hr />
        {rows.map(([label, value]) => (
          <p key={label} className="row">
            <span>{label}</span>
            <span>{value}</span>
          </p>
        ))}
        <hr />
        <p className="row total">
          <span>{copy.openingCash}</span>
          <span>{money(close.openingCash)}</span>
        </p>
        <p className="row total">
          <span>{copy.expectedCash}</span>
          <span>{money(close.expectedCash)}</span>
        </p>
        <p className="row total">
          <span>{copy.counted}</span>
          <span>{money(close.countedCash)}</span>
        </p>
        <p className="row total">
          <span>{copy.difference}</span>
          <span>
            {close.difference === 0
              ? copy.balanced
              : `${close.difference > 0 ? copy.surplus : copy.shortage} ${money(Math.abs(close.difference))}`}
          </span>
        </p>
        {close.note && (
          <>
            <hr />
            <p className="note">{close.note}</p>
          </>
        )}
        <hr />
        <p className="center small">
          {copy.closedBy
            .replace("{who}", close.closedByLabel)
            .replace("{when}", formatDateTime(close.closedAt, locale))}
        </p>
      </main>
    </>
  );
}
