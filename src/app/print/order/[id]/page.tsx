import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getOrderDetail } from "@/lib/order-detail-server";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  localizeDigits,
} from "@/lib/format";
import { PrintControls } from "./controls";

export const metadata: Metadata = { title: "چاپ", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A guest bill or a kitchen ticket for one order, ready for the printer.
 *
 * Printed through the browser's own dialog, so it works with whatever printer
 * the venue already has — an 80 mm or 58 mm thermal printer at the counter,
 * or an office printer — with no driver or app to install. Lives outside the
 * dashboard so nothing but the receipt reaches the paper; the same `orders`
 * permission as the board guards it.
 *
 *   /print/order/<id>?kind=bill|ticket&paper=80|58&auto=1
 *
 * `auto=1` opens the print dialog as soon as the page is ready (used by the
 * board's buttons and its automatic kitchen printing).
 */
export default async function PrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; paper?: string; auto?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const kind = query.kind === "ticket" ? "ticket" : "bill";
  const paper = query.paper === "58" ? "58" : "80";

  const { restaurantId } = await requirePageTab("orders", `/print/order/${id}`);
  const [{ t, locale }, order, site] = await Promise.all([
    getI18n(),
    getOrderDetail(restaurantId, id),
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
  if (!order || !site) notFound();

  const money = (value: number) => formatMoney(value, locale);
  const digits = (value: string | number) => localizeDigits(value, locale);
  const copy = t.orderDetail;
  const logo = site.logoUrl ?? site.parentRestaurant?.logoUrl ?? null;

  const paymentLine =
    order.status === "CANCELED"
      ? t.print.canceled
      : order.paymentStatus === "PAID"
        ? `${t.print.paid} — ${order.paymentMethod === "ONLINE" ? copy.methodOnline : copy.methodCash}`
        : `${t.print.unpaid} — ${order.paymentMethod === "ONLINE" ? copy.methodOnline : copy.methodCash}`;

  return (
    <>
      {/* Static CSS, no user data. Sizes the page for the receipt roll. */}
      <style>{printCss(paper)}</style>

      <PrintControls
        kind={kind}
        paper={paper}
        auto={query.auto === "1"}
        orderId={order.id}
      />

      <main id="main" className="receipt" data-kind={kind}>
        {kind === "bill" ? (
          <>
            <header className="center">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="logo" />
              )}
              <p className="venue">{site.name}</p>
              {site.address && <p className="small">{site.address}</p>}
              {site.phone && (
                <p className="small" dir="ltr">
                  {digits(site.phone)}
                </p>
              )}
            </header>

            <hr />
            <p className="row">
              <span>
                {t.print.order} #{formatNumber(order.orderNumber, locale)}
              </span>
              <span>
                {formatDate(order.placedAt, locale)} {formatTime(order.placedAt, locale)}
              </span>
            </p>
            {order.tableNumber && (
              <p className="row">
                <span>{copy.table}</span>
                <span>{digits(order.tableNumber)}</span>
              </p>
            )}
            <p className="row">
              <span>{copy.customer}</span>
              <span>{order.customerName}</span>
            </p>
            <hr />

            <table>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="qty">{formatNumber(item.quantity, locale)}×</td>
                    <td>
                      {item.name}
                      {item.options.map((option) => (
                        <span key={option.id} className="option">
                          {option.name}
                        </span>
                      ))}
                    </td>
                    <td className="amount">{money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr />

            <p className="row">
              <span>{copy.subtotal}</span>
              <span>{money(order.subtotal)}</span>
            </p>
            {order.discount > 0 && (
              <p className="row">
                <span>
                  {copy.discount}
                  {order.discountCode ? ` (${order.discountCode})` : ""}
                </span>
                <span>−{money(order.discount)}</span>
              </p>
            )}
            {order.serviceCharge > 0 && (
              <p className="row">
                <span>{copy.serviceCharge}</span>
                <span>{money(order.serviceCharge)}</span>
              </p>
            )}
            {order.tax > 0 && (
              <p className="row">
                <span>{copy.tax}</span>
                <span>{money(order.tax)}</span>
              </p>
            )}
            {order.roundingAdjustment !== 0 && (
              <p className="row">
                <span>{copy.rounding}</span>
                <span>{money(order.roundingAdjustment)}</span>
              </p>
            )}
            {order.tip > 0 && (
              <p className="row">
                <span>{copy.tip}</span>
                <span>{money(order.tip)}</span>
              </p>
            )}
            <p className="row total">
              <span>{copy.total}</span>
              <span>
                {money(order.total)} {t.common.toman}
              </span>
            </p>
            <p className="center small">{paymentLine}</p>
            <hr />
            <p className="center">{t.print.thanks}</p>
          </>
        ) : (
          <>
            <header className="center">
              <p className="small">{t.print.ticket}</p>
              <p className="big">#{formatNumber(order.orderNumber, locale)}</p>
              {order.tableNumber && (
                <p className="venue">
                  {copy.table} {digits(order.tableNumber)}
                </p>
              )}
              <p className="small">
                {formatTime(order.placedAt, locale)} — {order.customerName}
              </p>
            </header>
            <hr />
            <ul className="ticket-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span className="qty">{formatNumber(item.quantity, locale)}×</span>{" "}
                  <strong>{item.name}</strong>
                  {item.options.map((option) => (
                    <span key={option.id} className="option">
                      {option.name}
                    </span>
                  ))}
                  {item.note && <span className="note">{item.note}</span>}
                </li>
              ))}
            </ul>
            {order.note && (
              <>
                <hr />
                <p className="note">{order.note}</p>
              </>
            )}
            {order.status === "CANCELED" && (
              <p className="big center">{t.print.canceled}</p>
            )}
          </>
        )}
      </main>
    </>
  );
}

function printCss(paper: "80" | "58"): string {
  const width = paper === "58" ? "50mm" : "72mm";
  return `
    @page { size: ${paper}mm auto; margin: 3mm; }
    html, body { background: #fff !important; color: #000 !important; }
    .receipt {
      width: ${width}; margin: 12px auto; color: #000; background: #fff;
      font-size: 12px; line-height: 1.7;
    }
    .receipt .center { text-align: center; }
    .receipt .small { font-size: 11px; }
    .receipt .venue { font-size: 15px; font-weight: 800; }
    .receipt .big { font-size: 30px; font-weight: 900; line-height: 1.2; }
    .receipt .logo { width: 48px; height: 48px; object-fit: contain; margin: 0 auto 4px; display: block; }
    .receipt hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .receipt .row { display: flex; justify-content: space-between; gap: 8px; }
    .receipt .total { font-size: 14px; font-weight: 900; margin-top: 2px; }
    .receipt table { width: 100%; border-collapse: collapse; }
    .receipt td { vertical-align: top; padding: 2px 0; }
    .receipt .qty { white-space: nowrap; padding-inline-end: 4px; font-weight: 700; }
    .receipt .amount { white-space: nowrap; text-align: end; padding-inline-start: 6px; }
    .receipt .option { display: block; font-size: 11px; padding-inline-start: 8px; }
    .receipt .option::before { content: "↳ "; }
    .receipt[data-kind="ticket"] { font-size: 15px; }
    .receipt .ticket-items { list-style: none; padding: 0; margin: 0; }
    .receipt .ticket-items li { padding: 4px 0; border-bottom: 1px dotted #000; }
    .receipt .note { display: block; margin-top: 2px; padding: 2px 4px; border: 1.5px solid #000; font-weight: 700; }
    @media print {
      .no-print { display: none !important; }
      .receipt { margin: 0; }
    }
  `;
}
