import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentProvider } from "@/lib/payments";
import { env } from "@/lib/env";
import { addMonths } from "@/lib/onboarding";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publishOrderEvent } from "@/lib/events";
import { RATE_LIMITS } from "@/lib/constants";
import { markBroadcastPaid } from "@/lib/sms-broadcast-server";
import { cancelUnpaidOnlineOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gateway return endpoint for order, subscription and SMS broadcast payments.
 *
 * Never trusts the query string about whether money moved: the only thing the
 * redirect carries is an Authority, which is then verified server-to-server
 * against the gateway. It also always ends in a redirect to a human-readable
 * page, because this URL is loaded by the payer's browser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const authority =
    url.searchParams.get("Authority") ?? url.searchParams.get("authority") ?? "";
  const gatewayStatus =
    url.searchParams.get("Status") ?? url.searchParams.get("status") ?? "";
  const purpose = url.searchParams.get("purpose") ?? "order";
  const slug = url.searchParams.get("slug") ?? "";
  const token = url.searchParams.get("token") ?? "";

  const failureUrl = resultUrl(purpose, slug, token, "failed", null);

  // Public by necessity: the payer's browser follows the gateway's redirect
  // here. The Authority is long and gateway-issued, but an unthrottled endpoint
  // that looks a transaction up by identifier is still worth a ceiling.
  const limit = await rateLimit(
    `payment-callback:${clientIp(request)}`,
    RATE_LIMITS.paymentCallback,
  );
  if (!limit.allowed) return NextResponse.redirect(failureUrl);

  if (!authority) return NextResponse.redirect(failureUrl);

  const payment = await prisma.payment.findUnique({
    where: { authority },
    include: { order: true, subscription: { include: { plan: true } } },
  });

  if (!payment) return NextResponse.redirect(failureUrl);

  // Idempotency: a refresh or a duplicated gateway callback must not settle
  // the same transaction twice.
  if (payment.status === "PAID") {
    return NextResponse.redirect(
      resultUrl(purpose, slug, token, "success", payment.refId),
    );
  }

  const provider = createPaymentProvider();

  let result;
  try {
    result = await provider.verify({
      authority,
      amount: payment.amount,
      status: gatewayStatus,
    });
  } catch (error) {
    console.error("[payments] verification error", error);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: (error as Error).message.slice(0, 200) },
    });
    await releaseUnpaidOrder(payment);
    return NextResponse.redirect(failureUrl);
  }

  if (result.status !== "PAID") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureReason: result.message?.slice(0, 200) ?? result.status,
      },
    });
    await releaseUnpaidOrder(payment);
    return NextResponse.redirect(failureUrl);
  }

  const settledAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        refId: result.refId ?? null,
        cardPan: result.cardPan ?? null,
        verifiedAt: settledAt,
      },
    });

    if (payment.purpose === "ORDER" && payment.orderId) {
      // `paidAt` starts the board's retirement clock, so it is written in the
      // same statement as the status it belongs to.
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: "PAID", paidAt: new Date() },
      });
    }

    if (payment.purpose === "SUBSCRIPTION" && payment.subscription) {
      const subscription = payment.subscription;
      // What was bought is what the payment recorded at checkout. Payments made
      // before that column existed fall back to the subscription's own plan.
      const interval = payment.interval ?? subscription.interval;
      const months = interval === "yearly" ? 12 : 1;

      // Extend from the later of "now" and the current period end, so paying
      // early tops up rather than truncates the remaining time.
      const base =
        subscription.currentPeriodEnd > new Date()
          ? subscription.currentPeriodEnd
          : new Date();
      // Clamped rather than `setMonth`, which rolls 31 January forward to
      // 3 March instead of clamping to the end of February.
      const nextEnd = addMonths(base, months);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          currentPeriodEnd: nextEnd,
          canceledAt: null,
          planId: payment.planId ?? subscription.planId,
          interval,
        },
      });
    }

    // The broadcast joins the admin queue here and nowhere else — the one state
    // change no person can make, because it is the gateway's word that the
    // money arrived. Nothing is sent: staff send it by hand from the queue.
    if (payment.purpose === "SMS_BROADCAST" && payment.smsBroadcastId) {
      await markBroadcastPaid(tx, payment.smsBroadcastId, settledAt);
    }
  });

  /*
    Tell every open screen the money arrived.

    `markOrderPaid` — the cash equivalent — has always published this, but the
    gateway path never did, so an online payment settling left the kitchen board
    showing "unpaid" until its next thirty-second poll. On a busy pass that is
    long enough for a waiter to chase a table that has already paid.

    After the transaction, not inside it: a listener must never be told about a
    state that could still roll back.
  */
  if (payment.purpose === "ORDER" && payment.orderId && payment.order) {
    publishOrderEvent({
      type: "order.updated",
      restaurantId: payment.order.restaurantId,
      orderId: payment.orderId,
      publicToken: payment.order.publicToken,
      at: new Date().toISOString(),
    });
  }

  return NextResponse.redirect(
    resultUrl(purpose, slug, token, "success", result.refId ?? null),
  );
}

/**
 * A guest's online payment failed or was abandoned at the gateway: if the
 * kitchen has not started the order, cancel it, so it stops counting as a sale
 * and its ingredients go back on the shelf. An order already being prepared is
 * left for staff, who can take the money at the counter instead.
 */
async function releaseUnpaidOrder(payment: {
  purpose: string;
  orderId: string | null;
  restaurantId: string;
}) {
  if (payment.purpose !== "ORDER" || !payment.orderId) return;
  try {
    await cancelUnpaidOnlineOrder(payment.restaurantId, payment.orderId);
  } catch (error) {
    // The guest is still redirected; the 15-minute sweep catches what this missed.
    console.error("[payments] could not release unpaid order", error);
  }
}

/**
 * Builds the page the payer is returned to.
 *
 * `slug` and `token` arrive in the query string and are therefore caller-
 * controlled, so both are percent-encoded rather than interpolated raw. They
 * previously went straight into the path, where a value containing `../` would
 * be normalised away by URL parsing and land the payer somewhere other than
 * their own order. The origin was never in doubt — it is always our own — but
 * the path was, and a payment confirmation is the wrong screen to be wrong
 * about.
 */
function resultUrl(
  purpose: string,
  slug: string,
  token: string,
  outcome: "success" | "failed",
  refId: string | null,
): string {
  const suffix = refId ? `&ref=${encodeURIComponent(refId)}` : "";

  if (purpose === "subscription") {
    return `${env.NEXT_PUBLIC_APP_URL}/dashboard/subscription?payment=${outcome}${suffix}`;
  }

  if (purpose === "sms") {
    return `${env.NEXT_PUBLIC_APP_URL}/dashboard/campaigns?payment=${outcome}${suffix}`;
  }

  const safeSlug = encodeURIComponent(slug);
  const safeToken = encodeURIComponent(token);
  return `${env.NEXT_PUBLIC_APP_URL}/menu/${safeSlug}/order/${safeToken}?payment=${outcome}${suffix}`;
}
