import { fail, ok, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { REFUND_CLEAR_AFTER_MS, REFUND_CLEAR_AFTER_MINUTES } from "@/lib/constants";
import { publishOrderEvent } from "@/lib/events";
import { formatMoney } from "@/lib/format";

export const runtime = "nodejs";

/**
 * Clears a cancelled, already-paid order off the refund queue.
 *
 * `requireTab`, not `requireTenant`: cancelling an order is kitchen
 * work, but asserting that money went back to a customer closes a financial
 * obligation, so kitchen staff are excluded.
 *
 * A branch manager is included, and has to be. Under `requireOwner` a refund
 * raised at a branch was unclearable by anyone: the branch manager was refused,
 * and the chain owner — who could pass the check — only ever sees head office
 * orders, so the debt would have sat on that branch's board permanently. The
 * person who runs the site is the person who hands the money back.
 *
 * The one-hour wait is enforced here rather than by hiding the button. A
 * disabled control is a hint; this is the rule. Without it the queue could be
 * emptied in the same click-through as the cancellation, which is exactly the
 * reflex the delay exists to interrupt.
 *
 * Idempotent: clearing an already-cleared order returns the existing timestamp
 * rather than overwriting it, so a double-tap cannot rewrite when the refund
 * was recorded.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireTab("orders");
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const order = await prisma.order.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      canceledAt: true,
      refundedAt: true,
      publicToken: true,
    },
  });

  if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

  if (order.refundedAt) {
    return ok({ id: order.id, refundedAt: order.refundedAt.toISOString() });
  }

  if (order.status !== "CANCELED" || order.paymentStatus !== "PAID") {
    return fail(409, "این سفارش در صف بازگشت وجه نیست", "NOT_AWAITING_REFUND");
  }

  // `canceledAt` is written by updateOrderStatus. A cancelled order without one
  // predates that column; treat it as long past rather than un-clearable.
  const cancelledAt = order.canceledAt?.getTime() ?? 0;
  const elapsed = Date.now() - cancelledAt;

  if (elapsed < REFUND_CLEAR_AFTER_MS) {
    const minutesLeft = Math.ceil((REFUND_CLEAR_AFTER_MS - elapsed) / 60_000);
    return fail(
      409,
      `تا ${minutesLeft} دقیقه دیگر نمی‌توان این سفارش را از صف خارج کرد`,
      "REFUND_TOO_SOON",
    );
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { refundedAt: new Date() },
    select: { refundedAt: true },
  });

  await recordAudit({
    actor: user,
    restaurantId,
    action: "ORDER_REFUNDED",
    summary: `بازگشت وجه سفارش شماره ${order.orderNumber} به مبلغ ${formatMoney(order.total)} تومان ثبت شد`,
    entityType: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      total: order.total,
      waitedMinutes: Math.round(elapsed / 60_000),
      requiredMinutes: REFUND_CLEAR_AFTER_MINUTES,
    },
    ip: clientIp(request),
  });

  // The board listens, so the card leaves every open screen rather than only
  // the one that cleared it.
  publishOrderEvent({
    type: "order.updated",
    restaurantId,
    orderId: order.id,
    publicToken: order.publicToken,
    at: new Date().toISOString(),
  });

  return ok({ id: order.id, refundedAt: updated.refundedAt!.toISOString() });
});
