import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageOwner } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getSiteInfo } from "@/lib/cms/content-server";
import { formatDateTime, formatMoney, localizeDigits } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "رسید پرداخت", robots: { index: false } };
export const dynamic = "force-dynamic";

const CSS = `
  @page { size: A5; margin: 12mm; }
  html, body { background: #fff !important; color: #000 !important; }
  .doc { max-width: 148mm; margin: 24px auto; padding: 0 16px; font-size: 13px; line-height: 1.9; color: #000; }
  .doc h1 { font-size: 18px; font-weight: 900; margin: 0; }
  .doc .muted { color: #444; font-size: 12px; }
  .doc .party { border: 1px solid #000; border-radius: 6px; padding: 8px 12px; margin-top: 10px; }
  .doc .party b { display: block; margin-bottom: 2px; }
  .doc table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  .doc th, .doc td { border: 1px solid #000; padding: 6px 8px; text-align: start; vertical-align: top; }
  .doc th { background: #f2f2f2; font-weight: 800; }
  .doc .num { white-space: nowrap; text-align: end; }
  .doc .total td { font-weight: 900; font-size: 14px; }
  .doc .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  @media print { .no-print { display: none !important; } .doc { margin: 0 auto; } }
`;

/**
 * A receipt for one subscription payment, printable on A5.
 *
 * The owner's own payments only, and only settled ones: a pending or failed
 * attempt has nothing to acknowledge. The seller's legal details come from the
 * site settings the admin maintains (/admin/site); fields left empty there are
 * simply not printed.
 *
 * This is a payment receipt, not an official tax invoice (صورتحساب رسمی
 * سامانهٔ مؤدیان): issuing those requires registering with the tax
 * administration, which is the business owner's step to take.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { restaurantId } = await requirePageOwner("/dashboard/subscription");
  const { id } = await params;
  const { t, locale } = await getI18n();
  const copy = t.receipt;

  const [payment, site] = await Promise.all([
    prisma.payment.findFirst({
      where: { id, restaurantId, purpose: "SUBSCRIPTION", status: "PAID" },
      select: {
        id: true,
        amount: true,
        refId: true,
        cardPan: true,
        interval: true,
        planSnapshot: true,
        verifiedAt: true,
        createdAt: true,
        provider: true,
        restaurant: {
          select: {
            name: true,
            address: true,
            phone: true,
            owner: { select: { name: true, phone: true } },
          },
        },
      },
    }),
    getSiteInfo(locale),
  ]);
  if (!payment) notFound();

  const snapshot = (payment.planSnapshot ?? {}) as {
    name?: string;
    regularAmount?: number;
  };
  const paidAt = payment.verifiedAt ?? payment.createdAt;
  // Stable and unique per payment; the date is printed beside it.
  const number = `R-${payment.id.slice(-8).toUpperCase()}`;
  const money = (value: number) => `${formatMoney(value, locale)} ${t.common.toman}`;
  const interval =
    payment.interval === "yearly" ? t.subscription.yearly : t.subscription.monthly;
  const discount =
    snapshot.regularAmount && snapshot.regularAmount > payment.amount
      ? snapshot.regularAmount - payment.amount
      : 0;
  const legal = site.legal;

  return (
    <>
      <style>{CSS}</style>
      <main id="main" className="doc">
        <PrintButton />
        <div className="head">
          <div>
            <h1>{copy.title}</h1>
            <p className="muted">
              {copy.number}: <bdi>{localizeDigits(number, locale)}</bdi>
            </p>
          </div>
          <p className="muted">{formatDateTime(paidAt, locale)}</p>
        </div>

        <section className="party">
          <b>{copy.seller}</b>
          {legal.name}
          {legal.nationalId && (
            <div>
              {copy.nationalId}: <bdi>{localizeDigits(legal.nationalId, locale)}</bdi>
            </div>
          )}
          {legal.economicCode && (
            <div>
              {copy.economicCode}: <bdi>{localizeDigits(legal.economicCode, locale)}</bdi>
            </div>
          )}
          {site.address && <div>{site.address}</div>}
          {legal.postalCode && (
            <div>
              {copy.postalCode}: <bdi>{localizeDigits(legal.postalCode, locale)}</bdi>
            </div>
          )}
          {site.phone && (
            <div>
              {copy.phone}:{" "}
              <bdi dir="ltr">{localizeDigits(site.phone.display, locale)}</bdi>
            </div>
          )}
        </section>

        <section className="party">
          <b>{copy.buyer}</b>
          {payment.restaurant.name}
          {payment.restaurant.owner?.name && <div>{payment.restaurant.owner.name}</div>}
          {payment.restaurant.address && <div>{payment.restaurant.address}</div>}
          {(payment.restaurant.phone ?? payment.restaurant.owner?.phone) && (
            <div>
              {copy.phone}:{" "}
              <bdi dir="ltr">
                {localizeDigits(
                  (payment.restaurant.phone ?? payment.restaurant.owner?.phone)!,
                  locale,
                )}
              </bdi>
            </div>
          )}
        </section>

        <table>
          <thead>
            <tr>
              <th>{copy.description}</th>
              <th className="num">{copy.amount}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {copy.subscriptionLine
                  .replace("{plan}", snapshot.name ?? "—")
                  .replace("{interval}", interval)}
              </td>
              <td className="num">{money(snapshot.regularAmount ?? payment.amount)}</td>
            </tr>
            {discount > 0 && (
              <tr>
                <td>{copy.discount}</td>
                <td className="num">−{money(discount)}</td>
              </tr>
            )}
            <tr className="total">
              <td>{copy.paid}</td>
              <td className="num">{money(payment.amount)}</td>
            </tr>
          </tbody>
        </table>

        <p className="muted" style={{ marginTop: 12 }}>
          {copy.gateway}:{" "}
          {payment.provider === "mock"
            ? copy.testGateway
            : payment.provider === "zarinpal"
              ? copy.zarinpal
              : payment.provider}
          {payment.refId && (
            <>
              {" · "}
              {copy.refId}: <bdi>{payment.refId}</bdi>
            </>
          )}
          {payment.cardPan && (
            <>
              {" · "}
              {copy.card}: <bdi dir="ltr">{payment.cardPan}</bdi>
            </>
          )}
        </p>
        <p className="muted">{copy.notTaxInvoice}</p>
      </main>
    </>
  );
}
