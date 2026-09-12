import { revalidatePath } from "next/cache";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { RestaurantSettingsSchema } from "@/lib/validation";
import { getPlanLimits } from "@/lib/plans";

export const runtime = "nodejs";

export const PATCH = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const input = await parseBody(request, RestaurantSettingsSchema);

  // Online payment is a paid capability; the toggle in the UI is hidden on
  // lower plans, but the API is the boundary that actually enforces it.
  const limits = await getPlanLimits(restaurantId);
  // Undefined means "not part of this update" and must stay undefined; only
  // force it off when the caller actually tried to enable it without the plan.
  const onlinePaymentEnabled =
    input.onlinePaymentEnabled === undefined
      ? undefined
      : limits.allowsOnlinePay
        ? input.onlinePaymentEnabled
        : false;

  /**
   * Distinguishes "field omitted" from "field cleared".
   *
   * `value || null` collapses both to null, so on a PATCH that sends only one
   * toggle, every optional text field would be wiped. `undefined` tells Prisma
   * to leave the column alone; an empty string is a deliberate clear.
   */
  const optionalText = (value: string | undefined) =>
    value === undefined ? undefined : value.trim() === "" ? null : value;

  const restaurant = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      name: input.name,
      nameEn: optionalText(input.nameEn),
      tagline: optionalText(input.tagline),
      description: optionalText(input.description),
      logoUrl: optionalText(input.logoUrl),
      coverUrl: optionalText(input.coverUrl),
      phone: optionalText(input.phone),
      phoneSecondary: optionalText(input.phoneSecondary),
      address: optionalText(input.address),
      instagram: optionalText(input.instagram),
      // Same omitted-vs-cleared rule as the text fields: an absent key leaves
      // the column alone, while an empty array is a deliberate "remove them
      // all" and has to be written.
      socialLinks: input.socialLinks === undefined ? undefined : input.socialLinks,
      onlineOrderingEnabled: input.onlineOrderingEnabled,
      onlinePaymentEnabled,
      showPrices: input.showPrices,
      isPublished: input.isPublished,
      defaultLocale: input.defaultLocale,
      featuredSectionEnabled: input.featuredSectionEnabled,
    },
    select: { slug: true },
  });

  revalidatePath(`/menu/${restaurant.slug}`);

  return ok({ slug: restaurant.slug, onlinePaymentEnabled });
});
