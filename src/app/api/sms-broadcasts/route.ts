import { ok, parseBody, route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { SMS_CHECKOUT_ENABLED } from "@/lib/features";
import { createPaymentProvider } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { createBroadcast, listVenueBroadcasts } from "@/lib/sms-broadcast-server";
import { SmsBroadcastSchema } from "@/lib/validation";
import { broadcastError } from "./errors";

export const runtime = "nodejs";

/** The venue's own broadcasts, newest first. Counts and status only. */
export const GET = route(async () => {
  const { restaurantId } = await requireOwner();
  return ok(await listVenueBroadcasts(restaurantId));
});

/**
 * Buys a promotional SMS: prices it, freezes its recipients, starts payment.
 *
 * The venue pays **the platform**, the same direction as a subscription, and so
 * sits behind its own switch — see `SMS_CHECKOUT_ENABLED`. Nothing is sent from
 * here or from anywhere in the application: once the gateway confirms payment,
 * the request appears in the admin queue for staff to send by hand.
 *
 * The amount charged is the amount computed on the server from the frozen list,
 * never a figure the client sent. The composer's quote is a preview; this is the
 * bill.
 */
export const POST = route(async (request: Request) => {
  if (!SMS_CHECKOUT_ENABLED) {
    throw new HttpError(
      403,
      "Online payment for SMS is not available yet",
      "SMS_CHECKOUT_DISABLED",
    );
  }

  const { restaurantId, user } = await requireOwner();
  const input = await parseBody(request, SmsBroadcastSchema);

  const created = await createBroadcast(restaurantId, user.id, input);
  if (!created.ok) throw broadcastError(created.error);

  const { quote } = created;

  const provider = createPaymentProvider();
  const payment = await provider.request({
    amount: quote.amount,
    description: `پیامک تبلیغاتی — ${quote.recipientCount} گیرنده`,
    callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/api/payments/callback?purpose=sms`,
    // The payer's sign-in number; Zarinpal shows it on its payment page.
    mobile: user.phone ?? undefined,
  });

  await prisma.payment.create({
    data: {
      restaurantId,
      purpose: "SMS_BROADCAST",
      smsBroadcastId: created.id,
      provider: provider.name,
      amount: quote.amount,
      status: "PENDING",
      authority: payment.authority,
    },
  });

  await recordAudit({
    actor: user,
    restaurantId,
    action: "SMS_BROADCAST_REQUESTED",
    summary: `درخواست پیامک تبلیغاتی برای ${quote.recipientCount} گیرنده ثبت شد`,
    entityType: "SmsBroadcast",
    entityId: created.id,
    metadata: {
      recipientCount: quote.recipientCount,
      parts: quote.parts,
      pricePerPart: quote.pricePerPart,
      amount: quote.amount,
      campaignId: input.campaignId ?? null,
    },
  });

  return ok({ paymentUrl: payment.redirectUrl });
});
