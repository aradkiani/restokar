import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { createPaymentProvider } from "@/lib/payments";
import { env } from "@/lib/env";
import { SUBSCRIPTION_CHECKOUT_ENABLED } from "@/lib/features";
import { effectivePrice, snapshotLimits } from "@/lib/plan-terms";

export const runtime = "nodejs";

const CheckoutSchema = z.object({
  planCode: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]),
});

/**
 * Starts paying for a plan. Changes nothing about the subscription.
 *
 * The plan, the interval and the price are written onto the *payment*, and the
 * payment callback applies them only once the gateway confirms the money. This
 * route used to switch the subscription to the chosen plan before redirecting,
 * so an owner who opened the gateway for a bigger plan and closed the tab kept
 * the bigger plan for free — and two overlapping checkouts could grant one
 * plan for the price of another.
 *
 * The amount is always read from the database, never from the request.
 */
export const POST = route(async (request: Request) => {
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

  // A contract-priced plan shows a "from" price for orientation; what a chain
  // actually pays is agreed with sales. It is never bought at that figure.
  if (plan.isContractPriced) {
    throw new HttpError(
      403,
      "این پلن با قرارداد فعال می‌شود؛ برای خرید با پشتیبانی تماس بگیرید",
      "PLAN_CONTRACT_ONLY",
    );
  }

  // The same function the pricing page shows prices with, promotions included.
  const price = effectivePrice(plan, input.interval, new Date());
  const amount = price.amount;
  if (amount <= 0) throw new HttpError(400, "This plan is not purchasable", "FREE_PLAN");

  /*
    The payment needs a subscription row to point at. An existing one is left
    exactly as it is. A venue without one (created before billing existed) gets
    a lapsed row on the chosen plan: it grants nothing until the payment lands,
    because a missing row already meant "no limits" and a lapsed one shows the
    renewal banner.
  */
  const subscription =
    (await prisma.subscription.findUnique({ where: { restaurantId } })) ??
    (await prisma.subscription.create({
      data: {
        restaurantId,
        planId: plan.id,
        interval: input.interval,
        status: "PAST_DUE",
        currentPeriodEnd: new Date(),
        limitsSnapshot: snapshotLimits(plan),
      },
    }));

  const provider = createPaymentProvider();
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/payments/callback?purpose=subscription`;

  const result = await provider.request({
    amount,
    description: `اشتراک ${plan.name} — ${input.interval === "yearly" ? "سالانه" : "ماهانه"}`,
    callbackUrl,
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
      planId: plan.id,
      interval: input.interval,
      planSnapshot: {
        name: plan.name,
        interval: input.interval,
        amount,
        regularAmount: price.regular ?? amount,
        ...snapshotLimits(plan),
      },
    },
  });

  return ok({ paymentUrl: result.redirectUrl });
});
