import { revalidatePath } from "next/cache";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { PricingOptionsSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Pricing options — tax, service charge, tip, rounding and the order minimum.
 *
 * Owner-only rather than any tenant member: these change what every guest is
 * charged, which is not something kitchen staff should be able to touch.
 *
 * Each field is optional, and `undefined` means "not part of this update" so a
 * PATCH carrying one toggle cannot blank the rest.
 */
export const PATCH = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const input = await parseBody(request, PricingOptionsSchema);

  const restaurant = await prisma.restaurant.update({
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
    },
    select: { slug: true },
  });

  // The public menu prints these totals, so its cached copy is now stale.
  revalidatePath(`/menu/${restaurant.slug}`);

  return ok({ slug: restaurant.slug });
});
