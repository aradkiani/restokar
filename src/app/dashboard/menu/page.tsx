import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/plans";
import { MenuBuilder } from "./builder";
import { isShortDescriptionOnly } from "@/templates/registry";
import { scheduleOrderBy, scheduleSelect } from "@/lib/schedule";
import {
  recommendationOrderBy,
  recommendationSelect,
} from "@/lib/recommendations-server";
import { bundleItemOrderBy, bundleItemSelect } from "@/lib/bundles-server";
import { normaliseDishTags } from "@/lib/dish-tags";

export const metadata: Metadata = { title: "مدیریت منو" };
export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const { restaurantId } = await requirePageTab("menu", "/dashboard/menu");
  const { locale } = await getI18n();

  const [venue, categories, products, limits] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { templateId: true, menuPriceStep: true, lowMarginPercent: true },
    }),
    prisma.category.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
      include: {
        availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
      },
    }),
    prisma.product.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
        recommendations: { select: recommendationSelect, orderBy: recommendationOrderBy },
        bundleItems: { select: bundleItemSelect, orderBy: bundleItemOrderBy },
        infoSections: { orderBy: { sortOrder: "asc" } },
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { choices: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    getPlanLimits(restaurantId),
  ]);

  return (
    <MenuBuilder
      locale={locale}
      /* Vitrin and anything like it show a short description and nothing else,
         so the editor hides the fields that template would never render. */
      shortOnly={isShortDescriptionOnly(venue?.templateId)}
      pricing={{
        step: venue?.menuPriceStep ?? 0,
        lowMarginPercent: venue?.lowMarginPercent ?? 30,
      }}
      initialCategories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        icon: category.icon,
        iconUrl: category.iconUrl,
        isActive: category.isActive,
        sortOrder: category.sortOrder,
        scheduleEnabled: category.scheduleEnabled,
        availabilityWindows: category.availabilityWindows,
      }))}
      initialProducts={products.map((product) => ({
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        nameEn: product.nameEn,
        shortDescription: product.shortDescription,
        fullDescription: product.fullDescription,
        shortDescriptionEn: product.shortDescriptionEn,
        fullDescriptionEn: product.fullDescriptionEn,
        pairingNote: product.pairingNote,
        pairingNoteEn: product.pairingNoteEn,
        imageUrl: product.imageUrl,
        price: product.price,
        priceExact: product.priceExact,
        compareAtPrice: product.compareAtPrice,
        costPrice: product.costPrice,
        costFromRecipe: product.costFromRecipe,
        prepMinutes: product.prepMinutes,
        dietaryTags: normaliseDishTags(product.dietaryTags),
        isAvailable: product.isAvailable,
        hideWhenUnavailable: product.hideWhenUnavailable,
        isFeatured: product.isFeatured,
        sortOrder: product.sortOrder,
        scheduleEnabled: product.scheduleEnabled,
        availabilityWindows: product.availabilityWindows,
        recommendations: product.recommendations.map((edge) => ({
          recommendedProductId: edge.recommendedProductId,
          isActive: edge.isActive,
        })),
        bundleItems: product.bundleItems.map((item) => ({
          componentProductId: item.componentProductId,
          quantity: item.quantity,
        })),
        featuredOrder: product.featuredOrder,
        featuredLabel: product.featuredLabel,
        featuredLabelText: product.featuredLabelText,
        // Serialised, because a Date cannot cross the server/client
        // boundary as a prop the way a string can.
        featuredFrom: product.featuredFrom?.toISOString() ?? null,
        featuredUntil: product.featuredUntil?.toISOString() ?? null,
        infoSections: product.infoSections.map((section) => ({
          title: section.title,
          content: section.content,
          titleEn: section.titleEn,
          contentEn: section.contentEn,
          icon: section.icon,
        })),
        optionGroups: product.optionGroups.map((group) => ({
          name: group.name,
          nameEn: group.nameEn,
          isRequired: group.isRequired,
          maxSelect: group.maxSelect,
          isUpgrade: group.isUpgrade,
          choices: group.choices.map((choice) => ({
            name: choice.name,
            nameEn: choice.nameEn,
            priceDelta: choice.priceDelta,
            costDelta: choice.costDelta,
            isAvailable: choice.isAvailable,
          })),
        })),
      }))}
      limits={{ maxProducts: limits.maxProducts, maxCategories: limits.maxCategories }}
    />
  );
}
