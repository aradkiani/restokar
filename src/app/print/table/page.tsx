import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { tableTab } from "@/lib/table-tab-server";
import { mergeBillLines, sumBill } from "@/lib/table-tab";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  localizeDigits,
} from "@/lib/format";
import { printCss } from "../shared";
import { AutoPrint } from "./auto-print";

export const metadata: Metadata = { title: "چاپ", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * One bill for everything a table has ordered and not yet paid.
 *
 *   /print/table?table=7&paper=80|58&auto=1
 *
 * The same open-tab rule as the board's Tables view (`table-tab.ts`): rounds
 * of the same dish merge into one line, and every charge is the sum of the
 * orders' own figures — nothing is recomputed, so it agrees with each order.
 */
export default async function PrintTablePage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; paper?: string; auto?: string }>;
}) {
  const query = await searchParams;
  const table = (query.table ?? "").slice(0, 20);
  const paper = query.paper === "58" ? "58" : "80";

  const { restaurantId } = await requirePageTab(
    "orders",
    `/print/table?table=${encodeURIComponent(table)}`,
  );
  const [{ t, locale }, tab, site] = await Promise.all([
    getI18n(),
    table ? tableTab(restaurantId, table) : Promise.resolve(null),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        address: true,
        phone: true,
        logoUrl: true,
        parentRestaurant: { select: { logoUrl: true } },
      },
    }),
  ]);

  const money = (value: number) => formatMoney(value, locale);
  const copy = t.orderDetail;

  if (!tab || !site) {
    return (
      <main id="main" className="p-8 text-center text-sm">
        {t.errors.codes.TABLE_NOT_OPEN}
      </main>
    );
  }

  const lines = mergeBillLines(tab.orders);
  const totals = sumBill(tab.orders);
  const logo = site.logoUrl ?? site.parentRestaurant?.logoUrl ?? null;
  const now = new Date();

  return (
    <>
      <style>{printCss(paper)}</style>
      {query.auto === "1" && <AutoPrint />}

      <main id="main" className="receipt" data-kind="bill">
        <header className="center">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="logo" />
          )}
          <p className="venue">{site.name}</p>
          {site.address && <p className="small">{site.address}</p>}
          {site.phone && (
            <p className="small" dir="ltr">
              {localizeDigits(site.phone, locale)}
            </p>
          )}
        </header>
        <hr />
        <p className="row">
          <span className="venue">
            {copy.table} {localizeDigits(tab.table, locale)}
          </span>
          <span>
            {formatDate(now, locale)} {formatTime(now, locale)}
          </span>
        </p>
        <p className="small">
          {t.print.order}:{" "}
          {tab.orders
            .map((order) => `#${formatNumber(order.orderNumber, locale)}`)
            .join("، ")}
        </p>
        <hr />

        <table>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="qty">{formatNumber(line.quantity, locale)}×</td>
                <td>
                  {line.name}
                  {line.options.map((option) => (
                    <span key={option} className="option">
                      {option}
                    </span>
                  ))}
                </td>
                <td className="amount">{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />

        <p className="row">
          <span>{copy.subtotal}</span>
          <span>{money(totals.subtotal)}</span>
        </p>
        {totals.discount > 0 && (
          <p className="row">
            <span>{copy.discount}</span>
            <span>−{money(totals.discount)}</span>
          </p>
        )}
        {totals.serviceCharge > 0 && (
          <p className="row">
            <span>{copy.serviceCharge}</span>
            <span>{money(totals.serviceCharge)}</span>
          </p>
        )}
        {totals.tax > 0 && (
          <p className="row">
            <span>{copy.tax}</span>
            <span>{money(totals.tax)}</span>
          </p>
        )}
        {totals.roundingAdjustment !== 0 && (
          <p className="row">
            <span>{copy.rounding}</span>
            <span>{money(totals.roundingAdjustment)}</span>
          </p>
        )}
        {totals.tip > 0 && (
          <p className="row">
            <span>{copy.tip}</span>
            <span>{money(totals.tip)}</span>
          </p>
        )}
        <p className="row total">
          <span>{copy.total}</span>
          <span>
            {money(totals.total)} {t.common.toman}
          </span>
        </p>
        <hr />
        <p className="center">{t.print.thanks}</p>
      </main>
    </>
  );
}
