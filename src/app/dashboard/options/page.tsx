import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getTranslationStatus } from "@/lib/translation-status";
import { OptionsForm } from "./form";
import { BulkPriceCard } from "./bulk-price";
import { MenuPricingCard } from "./menu-pricing";

export const metadata: Metadata = { title: "تنظیمات بیشتر" };
export const dynamic = "force-dynamic";

/**
 * Pricing options. Owner-only via requirePageOwner — these decide what every
 * guest is charged, so kitchen staff are bounced to the order board.
 */
export default async function MoreOptionsPage() {
  const { restaurantId } = await requirePageOwner("/dashboard/options");

  const [restaurant, translation] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        taxEnabled: true,
        taxPercent: true,
        serviceChargeEnabled: true,
        serviceChargePercent: true,
        tipEnabled: true,
        tipPercents: true,
        roundingIncrement: true,
        roundingDirection: true,
        minimumOrderAmount: true,
        staffCallEnabled: true,
        staffCallLabel: true,
        staffCallLabelEn: true,
        bilingualEnabled: true,
        phoneCollectionEnabled: true,
        takeawayEnabled: true,
        menuPriceStep: true,
        autoRepriceFromCost: true,
        lowMarginPercent: true,
      },
    }),
    getTranslationStatus(restaurantId),
  ]);

  if (!restaurant) return null;

  return (
    <div className="space-y-5">
      <OptionsForm
        translation={translation}
        initial={{
          taxEnabled: restaurant.taxEnabled,
          taxPercent: restaurant.taxPercent,
          serviceChargeEnabled: restaurant.serviceChargeEnabled,
          serviceChargePercent: restaurant.serviceChargePercent,
          tipEnabled: restaurant.tipEnabled,
          tipPercents: restaurant.tipPercents,
          roundingIncrement: restaurant.roundingIncrement,
          roundingDirection: restaurant.roundingDirection as "up" | "down" | "nearest",
          minimumOrderAmount: restaurant.minimumOrderAmount,
          staffCallEnabled: restaurant.staffCallEnabled,
          staffCallLabel: restaurant.staffCallLabel,
          staffCallLabelEn: restaurant.staffCallLabelEn ?? "",
          bilingualEnabled: restaurant.bilingualEnabled,
          phoneCollectionEnabled: restaurant.phoneCollectionEnabled,
          takeawayEnabled: restaurant.takeawayEnabled,
        }}
      />

      {/*
        Below the pricing rules rather than inside them.
        Tax, service and rounding describe how a price is *presented* at
        checkout; this one rewrites the prices themselves and cannot be undone
        by flipping a toggle back. Keeping it in its own card, after the form
        that saves, keeps the two from being read as the same kind of setting.
      */}
      {/* How dish prices are rounded and follow costs — above the bulk tool,
          which applies its percentage to the exact prices this card governs. */}
      <MenuPricingCard
        initial={{
          menuPriceStep: restaurant.menuPriceStep,
          autoRepriceFromCost: restaurant.autoRepriceFromCost,
          lowMarginPercent: restaurant.lowMarginPercent,
        }}
      />

      <BulkPriceCard step={restaurant.menuPriceStep} />
    </div>
  );
}
