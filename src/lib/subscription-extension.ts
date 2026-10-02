import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./auth/guards";
import { recordAudit } from "./audit";
import type { ExtensionType } from "@/generated/prisma/enums";

/**
 * Grants a subscription period manually.
 *
 * Two rules make this safe to hand to support staff:
 *
 * 1. It writes a SubscriptionExtension row, never a Payment. A gifted month is
 *    not revenue, and letting goodwill leak into platform revenue would corrupt
 *    the only number the business is measured on.
 * 2. Extending from `max(now, currentPeriodEnd)` — an already-lapsed
 *    subscription restarts from today rather than from its stale end date,
 *    which would silently grant less time than the operator intended.
 */
export async function extendSubscription(input: {
  restaurantId: string;
  admin: { id: string; phone: string | null; role: "SUPER_ADMIN" };
  days: number;
  extensionType: ExtensionType;
  reason: string;
}) {
  const subscription = await prisma.subscription.findUnique({
    where: { restaurantId: input.restaurantId },
    select: { id: true, currentPeriodEnd: true, status: true },
  });

  if (!subscription) {
    throw new HttpError(404, "Subscription not found", "SUBSCRIPTION_NOT_FOUND");
  }

  const now = new Date();
  const previousExpiration = subscription.currentPeriodEnd;
  const base = previousExpiration > now ? previousExpiration : now;
  const newExpiration = new Date(base.getTime() + input.days * 86_400_000);

  const [updated] = await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodEnd: newExpiration,
        // Reinstate a lapsed subscription; an active one is left as-is.
        status: subscription.status === "ACTIVE" ? "ACTIVE" : "ACTIVE",
        canceledAt: null,
      },
      select: { id: true, currentPeriodEnd: true, status: true },
    }),
    prisma.subscriptionExtension.create({
      data: {
        subscriptionId: subscription.id,
        adminId: input.admin.id,
        adminLabel: input.admin.phone ?? input.admin.id,
        extensionType: input.extensionType,
        previousExpiration,
        newExpiration,
        durationDays: input.days,
        reason: input.reason,
      },
    }),
  ]);

  await recordAudit({
    restaurantId: input.restaurantId,
    actor: input.admin,
    action: "SUBSCRIPTION_EXTENDED",
    entityType: "Subscription",
    entityId: subscription.id,
    summary:
      `اشتراک ${input.days} روز تمدید شد ` +
      `(${input.extensionType === "GIFT" ? "هدیه" : "دستی"}) — ${input.reason}`,
  });

  return {
    previousExpiration,
    newExpiration: updated.currentPeriodEnd,
    status: updated.status,
  };
}
