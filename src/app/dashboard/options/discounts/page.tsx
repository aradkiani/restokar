import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { DiscountsManager } from "./manager";

export const metadata: Metadata = { title: "کدهای تخفیف" };
export const dynamic = "force-dynamic";

/**
 * Discount codes. Owner-only for the same reason the pricing tab beside it is:
 * a code decides what a guest is charged.
 */
export default async function DiscountsPage() {
  const { restaurantId } = await requirePageOwner("/dashboard/options/discounts");

  const [restaurant, codes] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { discountCodesEnabled: true },
    }),
    prisma.discountCode.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        maxDiscount: true,
        isActive: true,
      },
    }),
  ]);

  if (!restaurant) return null;

  return (
    <DiscountsManager
      enabledAtCheckout={restaurant.discountCodesEnabled}
      initialCodes={codes}
    />
  );
}
