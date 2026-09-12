import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/plans";
import { env } from "@/lib/env";
import { SocialLinksSchema } from "@/lib/validation";
import { PAYMENTS_ENABLED } from "@/lib/features";
import { SettingsForm } from "./form";

export const metadata: Metadata = { title: "تنظیمات" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { restaurantId } = await requirePageOwner("/dashboard/settings");

  const [restaurant, limits] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        nameEn: true,
        tagline: true,
        description: true,
        logoUrl: true,
        coverUrl: true,
        phone: true,
        phoneSecondary: true,
        address: true,
        instagram: true,
        socialLinks: true,
        slug: true,
        onlineOrderingEnabled: true,
        onlinePaymentEnabled: true,
        showPrices: true,
        featuredSectionEnabled: true,
        isPublished: true,
        defaultLocale: true,
      },
    }),
    getPlanLimits(restaurantId),
  ]);

  if (!restaurant) return null;

  return (
    <SettingsForm
      baseUrl={env.NEXT_PUBLIC_APP_URL}
      allowsOnlinePay={limits.allowsOnlinePay}
      paymentsEnabled={PAYMENTS_ENABLED}
      initial={{
        name: restaurant.name,
        nameEn: restaurant.nameEn ?? "",
        tagline: restaurant.tagline ?? "",
        description: restaurant.description ?? "",
        logoUrl: restaurant.logoUrl ?? "",
        coverUrl: restaurant.coverUrl ?? "",
        phone: restaurant.phone ?? "",
        phoneSecondary: restaurant.phoneSecondary ?? "",
        address: restaurant.address ?? "",
        instagram: restaurant.instagram ?? "",
        // Parsed rather than cast: the column is JSON, so a value written
        // before the current shape existed must not reach the form as garbage.
        socialLinks: SocialLinksSchema.safeParse(restaurant.socialLinks).data ?? [],
        slug: restaurant.slug,
        onlineOrderingEnabled: restaurant.onlineOrderingEnabled,
        onlinePaymentEnabled: restaurant.onlinePaymentEnabled,
        showPrices: restaurant.showPrices,
        featuredSectionEnabled: restaurant.featuredSectionEnabled,
        isPublished: restaurant.isPublished,
        defaultLocale: restaurant.defaultLocale as "fa" | "en",
      }}
    />
  );
}
