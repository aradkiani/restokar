import { revalidatePath } from "next/cache";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { requireOwner } from "@/lib/auth/guards";
import { PricingOptionsSchema } from "@/lib/validation";
import { applyMenuPriceStep } from "@/lib/costing-server";
import { formatMoney } from "@/lib/format";

export const runtime = "nodejs";

/**
 * Pricing options — tax, service charge, tip, rounding, the order minimum, and
 * how menu prices are rounded and follow ingredient costs.
 *
 * Owner-only rather than any tenant member: these change what every guest is
 * charged, which is not something kitchen staff should be able to touch.
 *
 * Each field is optional, and `undefined` means "not part of this update" so a
 * PATCH carrying one toggle cannot blank the rest.
 *
 * Changing the menu price step re-derives every shown price from its exact
 * price in the same transaction, so the menu never shows a mix of old and new
 * rounding. The exact prices themselves never move here.
 */
export const PATCH = route(async (request: Request) => {
  const { user, restaurantId } = await requireOwner();
  const input = await parseBody(request, PricingOptionsSchema);

  const before = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { menuPriceStep: true },
  });
  const stepChanged =
    input.menuPriceStep !== undefined && input.menuPriceStep !== before.menuPriceStep;

  const { restaurant, reRounded } = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        discountCodesEnabled: input.discountCodesEnabled,
        showOrderDiscount: input.showOrderDiscount,
        taxEnabled: input.taxEnabled,
        taxPercent: input.taxPercent,
        serviceChargeEnabled: input.serviceChargeEnabled,
        serviceChargePercent: input.serviceChargePercent,
        tipEnabled: input.tipEnabled,
        tipPercents: input.tipPercents,
        roundingIncrement: input.roundingIncrement,
        roundingDirection: input.roundingDirection,
        minimumOrderAmount: input.minimumOrderAmount,
        staffCallEnabled: input.staffCallEnabled,
        staffCallLabel: input.staffCallLabel,
        staffCallLabelEn: input.staffCallLabelEn,
        bilingualEnabled: input.bilingualEnabled,
        phoneCollectionEnabled: input.phoneCollectionEnabled,
        takeawayEnabled: input.takeawayEnabled,
        menuPriceStep: input.menuPriceStep,
        autoRepriceFromCost: input.autoRepriceFromCost,
        lowMarginPercent: input.lowMarginPercent,
      },
      select: { slug: true, menuPriceStep: true },
    });

    const reRounded = stepChanged
      ? await applyMenuPriceStep(tx, restaurantId, restaurant.menuPriceStep)
      : 0;

    return { restaurant, reRounded };
  });

  if (stepChanged) {
    // Every shown price may have moved at once — the one change on this screen
    // that rewrites the menu, so it is on the record.
    await recordAudit({
      actor: user,
      restaurantId,
      action: "SETTINGS_CHANGED",
      summary: `گام رُند قیمت منو از ${formatMoney(before.menuPriceStep)} به ${formatMoney(restaurant.menuPriceStep)} تومان تغییر کرد`,
      metadata: {
        menuPriceStep: { before: before.menuPriceStep, after: restaurant.menuPriceStep },
        productsReRounded: reRounded,
      },
    });
  }

  // The public menu prints these totals and prices, so its cached copy is now
  // stale.
  revalidatePath(`/menu/${restaurant.slug}`);

  return ok({ slug: restaurant.slug, reRounded });
});
