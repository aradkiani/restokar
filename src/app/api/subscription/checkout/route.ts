import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { createPaymentProvider } from "@/lib/payments";
import { env } from "@/lib/env";
import { SUBSCRIPTION_CHECKOUT_ENABLED } from "@/lib/features";

export const runtime = "nodejs";

const CheckoutSchema = z.object({
  planCode: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]),
});

/** Starts a subscription purchase or renewal at the gateway. */
export const POST = route(async (request: Request) => {
  // The gateway is not connected. Subscriptions are granted by platform staff
  // from the admin console instead, so this refuses rather than starting a
  // payment that has nowhere to settle.
  if (!SUBSCRIPTION_CHECKOUT_ENABLED) {
    throw new HttpError(
      403,
      "Online payment is temporarily unavailable",
      "PAYMENTS_DISABLED",
    );
  }

  const { restaurantId, user } = await requireOwner();
  const input = await parseBody(request, CheckoutSchema);

  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.isPublic)
    throw new HttpError(404, "Plan not found", "PLAN_NOT_FOUND");

  const amount = input.interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  if (amount <= 0) throw new HttpError(400, "This plan is not purchasable", "FREE_PLAN");

  // Switching plan is recorded up front; the period only extends once payment
  // is verified in the callback.
  const subscription = await prisma.subscription.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      planId: plan.id,
      interval: input.interval,
      status: "PAST_DUE",
      currentPeriodEnd: new Date(),
    },
    update: { planId: plan.id, interval: input.interval },
  });

  const provider = createPaymentProvider();
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/payments/callback?purpose=subscription`;

  const result = await provider.request({
    amount,
    description: `اشتراک ${plan.name} — ${input.interval === "yearly" ? "سالانه" : "ماهانه"}`,
    callbackUrl,
    // The payer's sign-in number; Zarinpal shows it on its payment page.
    mobile: user.phone ?? undefined,
  });

  await prisma.payment.create({
    data: {
      restaurantId,
      purpose: "SUBSCRIPTION",
      subscriptionId: subscription.id,
      provider: provider.name,
      amount,
      status: "PENDING",
      authority: result.authority,
    },
  });

  return ok({ paymentUrl: result.redirectUrl });
});
