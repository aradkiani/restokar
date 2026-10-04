"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/client-api";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { CustomerSegment } from "@/lib/customers";
import type { OrderDetail } from "@/lib/order-detail-server";
import type { Dictionary, Locale } from "@/lib/i18n";

/**
 * Everything about one order, on one screen.
 *
 * The board card shows what a cook needs mid-service — table, dishes, how long
 * it has been waiting. This is the other question: *what exactly did this table
 * order, what were they charged, and who are they?* It is opened deliberately,
 * so it can afford a round trip and the full picture.
 *
 * Fetched on open rather than carried in the board's payload. The board is
 * polled every thirty seconds by every screen on the pass, and putting per-line
 * money and guest history into that response would ship it continuously to
 * everyone to serve the rare moment somebody taps a card.
 */

const SEGMENT_TONE: Record<CustomerSegment, "brand" | "success" | "warning" | "neutral"> =
  {
    new: "brand",
    returning: "neutral",
    loyal: "success",
    atRisk: "warning",
    inactive: "neutral",
  };

export function OrderDetailDialog({
  orderId,
  onClose,
  locale,
  t,
}: {
  orderId: string | null;
  onClose: () => void;
  locale: Locale;
  t: Dictionary;
}) {
  const copy = t.orderDetail;
  /*
    Each response is stored with the id it answers. Whatever is on screen is
    derived from that: a different id means "still loading", so opening another
    order can never flash the previous one's details.
  */
  const [fetched, setFetched] = React.useState<{
    id: string;
    order: OrderDetail | null;
    error: string | null;
  } | null>(null);
  const shown = fetched && fetched.id === orderId ? fetched : null;
  const loading = orderId !== null && shown === null;
  const order = shown?.order ?? null;
  const error = shown?.error ?? null;

  React.useEffect(() => {
    if (!orderId) return;

    /*
      Guards a slow response for an order the user has already navigated past.
      Tapping through three cards quickly would otherwise let the first reply
      land last and show the wrong order.
    */
    let current = true;

    void api.get<OrderDetail>(`/api/orders/${orderId}`).then((result) => {
      if (!current) return;
      setFetched(
        result.ok
          ? { id: orderId, order: result.data, error: null }
          : { id: orderId, order: null, error: result.error.message || t.common.error },
      );
    });

    return () => {
      current = false;
    };
  }, [orderId, t.common.error]);

  const money = (value: number) => `${formatMoney(value, locale)} ${t.common.toman}`;

  return (
    <Modal
      open={orderId !== null}
      onClose={onClose}
      size="xl"
      title={
        order ? `${copy.title} ${formatNumber(order.orderNumber, locale)}` : copy.title
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Loader2 className="size-6 animate-spin" aria-label={t.common.loading} />
        </div>
      )}

      {error && !loading && (
        <p className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {order && !loading && (
        <div className="space-y-5">
          <Summary order={order} copy={copy} t={t} locale={locale} />

          <Section title={copy.items}>
            <ul className="divide-y divide-ink-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-2.5">
                  <span className="shrink-0 text-sm font-black text-ink-500 tabular-nums">
                    {formatNumber(item.quantity, locale)}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">{item.name}</p>

                    {item.options.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5">
                        {item.options.map((option) => (
                          <li key={option.id} className="text-xs text-ink-500">
                            ↳ {option.name}
                            {option.priceDelta !== 0 && (
                              <span className="tabular-nums">
                                {" "}
                                ({option.priceDelta > 0 ? "+" : "−"}
                                {formatMoney(Math.abs(option.priceDelta), locale)})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {item.note && (
                      <p className="mt-0.5 text-xs text-amber-700">↳ {item.note}</p>
                    )}
                  </div>

                  <span className="shrink-0 text-sm font-semibold text-ink-800 tabular-nums">
                    {money(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {order.note && (
            <Section title={copy.orderNote}>
              <p className="rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                {order.note}
              </p>
            </Section>
          )}

          <Section title={copy.totals}>
            <dl className="space-y-1.5 text-sm">
              <Row label={copy.subtotal} value={money(order.subtotal)} />
              {order.discount > 0 && (
                <Row
                  label={
                    order.discountCode
                      ? `${copy.discount} (${order.discountCode})`
                      : copy.discount
                  }
                  value={`− ${money(order.discount)}`}
                  tone="positive"
                />
              )}
              {order.serviceCharge > 0 && (
                <Row label={copy.serviceCharge} value={money(order.serviceCharge)} />
              )}
              {order.tax > 0 && <Row label={copy.tax} value={money(order.tax)} />}
              {order.roundingAdjustment !== 0 && (
                <Row label={copy.rounding} value={money(order.roundingAdjustment)} />
              )}
              {order.tip > 0 && <Row label={copy.tip} value={money(order.tip)} />}
              <div className="border-t border-ink-200 pt-1.5">
                <Row label={copy.total} value={money(order.total)} strong />
              </div>
            </dl>
          </Section>

          <Section title={copy.timeline}>
            <ol className="space-y-1.5 text-sm">
              <Stamp label={copy.placedAt} at={order.placedAt} locale={locale} />
              <Stamp label={copy.preparingAt} at={order.preparingAt} locale={locale} />
              <Stamp label={copy.readyAt} at={order.readyAt} locale={locale} />
              <Stamp label={copy.deliveredAt} at={order.deliveredAt} locale={locale} />
              <Stamp label={copy.paidAt} at={order.paidAt} locale={locale} />
              <Stamp label={copy.canceledAt} at={order.canceledAt} locale={locale} />
              <Stamp label={copy.refundedAt} at={order.refundedAt} locale={locale} />
            </ol>
          </Section>

          {order.payments.length > 0 && (
            <Section title={copy.payments}>
              <ul className="space-y-2">
                {order.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="rounded-[var(--radius-sm)] border border-ink-200 p-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          payment.status === "PAID"
                            ? "success"
                            : payment.status === "FAILED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {payment.status === "PAID"
                          ? t.kitchen.paid
                          : (copy.paymentStates[payment.status as "PENDING" | "FAILED"] ??
                            payment.status)}
                      </Badge>
                      <span className="font-semibold text-ink-800 tabular-nums">
                        {money(payment.amount)}
                      </span>
                      {payment.refId && (
                        <span className="text-ink-500 tabular-nums" dir="ltr">
                          {copy.refId}: {payment.refId}
                        </span>
                      )}
                      {payment.cardPan && (
                        <span className="text-ink-500 tabular-nums" dir="ltr">
                          {payment.cardPan}
                        </span>
                      )}
                    </div>
                    {payment.failureReason && (
                      <p className="mt-1 text-red-700">{payment.failureReason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={copy.customer}>
            <CustomerPanel order={order} copy={copy} t={t} locale={locale} />
          </Section>
        </div>
      )}
    </Modal>
  );
}

/** The header block: where, how, and what state the order is in. */
function Summary({
  order,
  copy,
  t,
  locale,
}: {
  order: OrderDetail;
  copy: Dictionary["orderDetail"];
  t: Dictionary;
  locale: Locale;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">
        {t.orderStatus[order.status as keyof typeof t.orderStatus] ?? order.status}
      </Badge>

      <Badge tone={order.paymentStatus === "PAID" ? "success" : "warning"}>
        {order.paymentStatus === "PAID" ? t.kitchen.paid : t.kitchen.unpaid}
      </Badge>

      <Badge tone="neutral">
        {order.paymentMethod === "ONLINE" ? copy.methodOnline : copy.methodCash}
      </Badge>

      {order.tableNumber && (
        <Badge tone="brand">
          {copy.table} {order.tableNumber}
        </Badge>
      )}

      {/* Staff-written orders are worth distinguishing: they did not come
          through a QR code, so they are not evidence the codes are working. */}
      {order.isManual && <Badge tone="neutral">{copy.manual}</Badge>}

      <span className="ms-auto text-xs text-ink-500" dir="ltr">
        {formatDateTime(order.placedAt, locale)}
      </span>
    </div>
  );
}

/**
 * The guest, when the platform knows them.
 *
 * An order with no matching customer is normal rather than broken — a phone
 * number has never been required — so this says which of the two reasons
 * applies instead of showing a hollow profile.
 */
function CustomerPanel({
  order,
  copy,
  t,
  locale,
}: {
  order: OrderDetail;
  copy: Dictionary["orderDetail"];
  t: Dictionary;
  locale: Locale;
}) {
  const customer = order.customer;

  if (!customer) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3">
        <p className="text-sm font-semibold text-ink-800">{order.customerName}</p>
        {order.customerPhone && (
          <p className="mt-0.5 text-xs text-ink-500 tabular-nums" dir="ltr">
            {order.customerPhone}
          </p>
        )}
        <p className="mt-2 text-xs text-ink-500">
          {order.customerMissingReason === "noPhone"
            ? copy.customerNoPhone
            : copy.customerNotFound}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/dashboard/customers?q=${encodeURIComponent(customer.phone)}`}
      className="block rounded-[var(--radius-sm)] border border-ink-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <User className="size-4 text-ink-400" aria-hidden />
        <span className="text-sm font-bold text-ink-900">
          {customer.name ?? order.customerName}
        </span>
        <Badge tone={SEGMENT_TONE[customer.segment]}>
          {t.customers.segments[customer.segment]}
        </Badge>
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500 tabular-nums">
        <Phone className="size-3.5" aria-hidden />
        <span dir="ltr">{customer.phone}</span>
      </p>

      <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Metric
          label={t.customers.orders}
          value={formatNumber(customer.orderCount, locale)}
        />
        <Metric
          label={t.customers.revenue}
          value={`${formatMoney(customer.totalRevenue, locale)} ${t.common.toman}`}
        />
        <Metric
          label={t.customers.averageOrder}
          value={`${formatMoney(customer.averageOrderValue, locale)} ${t.common.toman}`}
        />
        <Metric
          label={t.customers.lastOrder}
          value={
            customer.daysSinceLastOrder === null
              ? "—"
              : t.customers.daysAgo.replace(
                  "{n}",
                  formatNumber(customer.daysSinceLastOrder, locale),
                )
          }
        />
      </dl>

      <p className="mt-2 text-xs font-semibold text-brand-700">{copy.openCustomer} ←</p>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-semibold text-ink-800 tabular-nums">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold text-ink-500">{title}</h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "positive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-bold text-ink-900" : "text-ink-600"}>{label}</dt>
      <dd
        className={
          strong
            ? "text-base font-black text-ink-900 tabular-nums"
            : tone === "positive"
              ? "text-emerald-700 tabular-nums"
              : "text-ink-800 tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** One moment in the order's life. Absent stages are simply not shown. */
function Stamp({
  label,
  at,
  locale,
}: {
  label: string;
  at: string | null;
  locale: Locale;
}) {
  if (!at) return null;

  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-ink-600">{label}</span>
      {/* Dates and times read left-to-right even in an RTL column. */}
      <span className="text-xs text-ink-500 tabular-nums" dir="ltr">
        {formatDateTime(at, locale)}
      </span>
    </li>
  );
}
