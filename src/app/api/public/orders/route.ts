import { fail, ok, parseBody, route } from "@/lib/api";
import { CreateOrderInput, createOrder } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { createPaymentProvider } from "@/lib/payments";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Places a guest order and, for online payment, starts the gateway handoff. */
export const POST = route(async (request: Request) => {
  const limit = await rateLimit(`order:${clientIp(request)}`, RATE_LIMITS.placeOrder);
  if (!limit.allowed) {
    return fail(
      429,
      "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      "RATE_LIMITED",
    );
  }

  const input = await parseBody(request, CreateOrderInput);
  const order = await createOrder(input);

  if (order.paymentMethod !== "ONLINE") {
    return ok({
      orderId: order.id,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
      total: order.total,
      paymentUrl: null,
    });
  }

  const provider = createPaymentProvider();
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/payments/callback?purpose=order&slug=${encodeURIComponent(
    input.slug,
  )}&token=${encodeURIComponent(order.publicToken)}`;

  /**
   * The Payment row is written *before* the gateway is contacted.
   *
   * The comment here used to say that was what happened; the code did the
   * opposite, creating the row only after `request()` returned. That ordering
   * has a window in which the gateway has issued an Authority — the payer can
   * already be on the payment page — while this side has no record of the
   * transaction at all. If the insert then failed, the callback would look the
   * Authority up, find nothing, and redirect the guest to a failure page for a
   * payment they had in fact made. Creating the row first means the worst case
   * is a PENDING row for a handoff that never started, which is inert.
   */
  const payment = await prisma.payment.create({
    data: {
      restaurantId: order.restaurantId,
      purpose: "ORDER",
      orderId: order.id,
      provider: provider.name,
      amount: order.total,
      status: "PENDING",
    },
    select: { id: true },
  });

  try {
    const result = await provider.request({
      amount: order.total,
      description: `سفارش شماره ${order.orderNumber}`,
      callbackUrl,
      /*
        Read back off the order rather than from the request body.

        `createOrder` has already normalised it and dropped it entirely if this
        venue does not collect phone numbers, so taking the stored value means
        the gateway can never be handed a number the venue declined to collect —
        and the prefill is guaranteed to match what the owner will later see
        against this payment.
      */
      mobile: order.customerPhone ?? undefined,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { authority: result.authority },
    });

    return ok({
      orderId: order.id,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
      total: order.total,
      paymentUrl: result.redirectUrl,
    });
  } catch (error) {
    // The order itself is valid and already in the kitchen queue; only the
    // online handoff failed. Send the guest to the status page rather than
    // discarding a real order.
    console.error("[payments] order handoff failed", error);

    await prisma.payment
      .update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureReason: String((error as Error)?.message ?? error).slice(0, 200),
        },
      })
      .catch(() => undefined);

    return ok({
      orderId: order.id,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
      total: order.total,
      paymentUrl: null,
      paymentError: true,
    });
  }
});
