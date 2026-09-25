import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { ProductPatchSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/format";
import {
  replaceSchedule,
  scheduleDiffers,
  scheduleOrderBy,
  scheduleSelect,
} from "@/lib/schedule";
import {
  recommendationOrderBy,
  recommendationSelect,
  replaceRecommendations,
} from "@/lib/recommendations-server";
import {
  bundleItemOrderBy,
  bundleItemSelect,
  replaceBundleItems,
} from "@/lib/bundles-server";
import { shownPrices } from "@/lib/costing";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireTab("menu");
  const { id } = await (context as Context).params;

  // Price is read before the update so the audit entry can record the actual
  // before/after — a bare "price changed" line is not worth storing.
  const existing = await prisma.product.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      name: true,
      price: true,
      priceExact: true,
      compareAtPrice: true,
      compareAtPriceExact: true,
      costFromRecipe: true,
      isFeatured: true,
      featuredOrder: true,
      featuredLabel: true,
      featuredLabelText: true,
      featuredFrom: true,
      featuredUntil: true,
      scheduleEnabled: true,
      // Read alongside the price and for the same reason: so the audit entry
      // can say what actually changed rather than that something did.
      availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
    },
  });
  if (!existing) throw new HttpError(404, "Product not found", "NOT_FOUND");

  const input = await parseBody(request, ProductPatchSchema);

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, restaurantId },
      select: { id: true },
    });
    if (!category) throw new HttpError(400, "Category not found", "CATEGORY_NOT_FOUND");
  }

  /*
    Prices: the typed figure is the exact price, and the shown one is derived.

    A price equal to what the menu shows *now* is not a change. The editor sends
    every field on every save, so the price comes back even when the owner only
    renamed the dish — and treating it as new would overwrite an exact price of
    251,035 with its shown 250,000, silently undoing every ingredient-driven
    increase each time anything was edited. Only a figure the owner actually
    changed replaces the exact price.
  */
  const priceTouched = input.price !== undefined && input.price !== existing.price;
  const compareTouched =
    input.compareAtPrice !== undefined &&
    input.compareAtPrice !== existing.compareAtPrice;

  let priceData: {
    priceExact: number;
    price: number;
    compareAtPriceExact: number | null;
    compareAtPrice: number | null;
  } | null = null;

  if (priceTouched || compareTouched) {
    const venue = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { menuPriceStep: true },
    });

    const priceExact = priceTouched ? input.price! : existing.priceExact;
    const compareAtPriceExact = compareTouched
      ? (input.compareAtPrice ?? null)
      : (existing.compareAtPriceExact ?? existing.compareAtPrice);

    const shown = shownPrices({
      priceExact,
      compareAtPriceExact,
      step: venue?.menuPriceStep ?? 0,
    });
    priceData = { priceExact, compareAtPriceExact, ...shown };
  }

  const product = await prisma.$transaction(async (tx) => {
    // Info sections are replaced wholesale: there are at most three and the
    // editor always submits the full set, so diffing would add complexity for
    // no benefit.
    if (input.infoSections) {
      await tx.productInfoSection.deleteMany({ where: { productId: id } });
      if (input.infoSections.length > 0) {
        await tx.productInfoSection.createMany({
          data: input.infoSections.map((section, index) => ({
            productId: id,
            title: section.title,
            content: section.content,
            titleEn: section.titleEn || null,
            contentEn: section.contentEn || null,
            icon: section.icon || null,
            sortOrder: index,
          })),
        });
      }
    }

    // Replaced wholesale like info sections. The rows are recreated with new
    // ids, which is harmless precisely because orders snapshot the group and
    // choice *names* rather than pointing at these rows — editing an option
    // therefore cannot reach backwards into an order already placed.
    if (input.optionGroups) {
      await tx.productOptionGroup.deleteMany({ where: { productId: id } });
      for (const [groupIndex, group] of input.optionGroups.entries()) {
        await tx.productOptionGroup.create({
          data: {
            productId: id,
            name: group.name,
            nameEn: group.nameEn || null,
            isRequired: group.isRequired,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            sortOrder: groupIndex,
            choices: {
              create: group.choices.map((choice, choiceIndex) => ({
                name: choice.name,
                nameEn: choice.nameEn || null,
                priceDelta: choice.priceDelta,
                costDelta: choice.costDelta,
                isAvailable: choice.isAvailable,
                sortOrder: choiceIndex,
              })),
            },
          },
        });
      }
    }

    // Replaced wholesale like the two collections above, and inside the same
    // transaction as the product row so hours and price can never disagree.
    // `undefined` means the caller said nothing about the schedule and the
    // existing one is left alone; `[]` is an explicit "clear it".
    if (input.schedule) {
      await replaceSchedule(
        tx,
        restaurantId,
        { kind: "product", productId: id },
        input.schedule,
      );
    }

    // Ownership of every suggested dish is proven inside the transaction, so a
    // cross-tenant id aborts the whole save rather than leaving the product
    // updated and its suggestions half-written.
    if (input.recommendations) {
      await replaceRecommendations(tx, restaurantId, id, input.recommendations);
    }

    // Absent means "leave it alone"; an empty array means "this is no longer a
    // bundle". The existing PATCH convention, and the reason this checks for
    // `undefined` rather than for length.
    if (input.bundleItems) {
      await replaceBundleItems(tx, restaurantId, id, input.bundleItems);
    }

    return tx.product.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn || null } : {}),
        ...(input.shortDescription !== undefined
          ? { shortDescription: input.shortDescription || null }
          : {}),
        ...(input.fullDescription !== undefined
          ? { fullDescription: input.fullDescription || null }
          : {}),
        ...(input.shortDescriptionEn !== undefined
          ? { shortDescriptionEn: input.shortDescriptionEn || null }
          : {}),
        ...(input.fullDescriptionEn !== undefined
          ? { fullDescriptionEn: input.fullDescriptionEn || null }
          : {}),
        // Absent leaves the note alone; an explicit empty string clears it back
        // to the platform's generic phrase.
        ...(input.pairingNote !== undefined
          ? { pairingNote: input.pairingNote || null }
          : {}),
        ...(input.pairingNoteEn !== undefined
          ? { pairingNoteEn: input.pairingNoteEn || null }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
        ...(priceData ?? {}),
        // A dish costed from its recipe takes its cost from the recipe; a typed
        // figure would be overwritten at the next ingredient change anyway, and
        // accepting it in between would let reports briefly disagree with the
        // recipe the owner can see.
        ...(input.costPrice !== undefined && !existing.costFromRecipe
          ? { costPrice: input.costPrice }
          : {}),
        ...(input.prepMinutes !== undefined ? { prepMinutes: input.prepMinutes } : {}),
        ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
        ...(input.hideWhenUnavailable !== undefined
          ? { hideWhenUnavailable: input.hideWhenUnavailable }
          : {}),
        ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.scheduleEnabled !== undefined
          ? { scheduleEnabled: input.scheduleEnabled }
          : {}),
        // Merchandising. Each is written only when the caller mentioned it, so
        // a partial save cannot clear a promotion it never asked about.
        ...(input.featuredOrder !== undefined
          ? { featuredOrder: input.featuredOrder }
          : {}),
        ...(input.featuredLabel !== undefined
          ? { featuredLabel: input.featuredLabel }
          : {}),
        ...(input.featuredLabelText !== undefined
          ? { featuredLabelText: input.featuredLabelText || null }
          : {}),
        ...(input.featuredFrom !== undefined ? { featuredFrom: input.featuredFrom } : {}),
        ...(input.featuredUntil !== undefined
          ? { featuredUntil: input.featuredUntil }
          : {}),
      },
      include: {
        infoSections: { orderBy: { sortOrder: "asc" } },
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { choices: { orderBy: { sortOrder: "asc" } } },
        },
        availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
        bundleItems: { select: bundleItemSelect, orderBy: bundleItemOrderBy },
        recommendations: {
          select: recommendationSelect,
          orderBy: recommendationOrderBy,
        },
      },
    });
  });

  const scheduleChanged =
    (input.schedule !== undefined &&
      scheduleDiffers(
        existing.availabilityWindows,
        input.schedule.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          startMinute: w.start,
          endMinute: w.end,
        })),
      )) ||
    (input.scheduleEnabled !== undefined &&
      input.scheduleEnabled !== existing.scheduleEnabled);

  if (scheduleChanged) {
    await recordAudit({
      actor: user,
      restaurantId,
      action: "SCHEDULE_CHANGED",
      summary: `ساعات ارائه «${existing.name}» تغییر کرد`,
      entityType: "Product",
      entityId: id,
      metadata: {
        before: {
          scheduleEnabled: existing.scheduleEnabled,
          windows: existing.availabilityWindows.length,
        },
        after: {
          scheduleEnabled: product.scheduleEnabled,
          windows: product.availabilityWindows.length,
        },
      },
    });
  }

  /*
    Merchandising changes are audited through the existing log, not a new one.

    Worth recording for the same reason a price change is: it decides what a
    venue pushes and therefore what it sells, and "why did this dish stop being
    promoted?" is a question someone asks weeks later. Compared field by field
    so resaving a product without touching the promotion writes nothing —
    an audit log full of entries that record no change is one nobody reads.
  */
  const featuredChanged = (
    ["isFeatured", "featuredOrder", "featuredLabel", "featuredLabelText"] as const
  ).some((key) => input[key] !== undefined && input[key] !== existing[key]);

  const windowChanged = (["featuredFrom", "featuredUntil"] as const).some(
    (key) =>
      input[key] !== undefined &&
      (input[key]?.getTime() ?? null) !== (existing[key]?.getTime() ?? null),
  );

  if (featuredChanged || windowChanged) {
    await recordAudit({
      actor: user,
      restaurantId,
      action: "FEATURED_CHANGED",
      summary: product.isFeatured
        ? `«${existing.name}» به‌عنوان محصول ویژه تنظیم شد`
        : `«${existing.name}» از محصولات ویژه خارج شد`,
      entityType: "Product",
      entityId: id,
      metadata: {
        before: {
          isFeatured: existing.isFeatured,
          featuredOrder: existing.featuredOrder,
          featuredLabel: existing.featuredLabel,
          featuredFrom: existing.featuredFrom,
          featuredUntil: existing.featuredUntil,
        },
        after: {
          isFeatured: product.isFeatured,
          featuredOrder: product.featuredOrder,
          featuredLabel: product.featuredLabel,
          featuredFrom: product.featuredFrom,
          featuredUntil: product.featuredUntil,
        },
      },
    });
  }

  if (priceData && priceTouched) {
    await recordAudit({
      actor: user,
      restaurantId,
      action: "PRICE_CHANGED",
      summary: `قیمت «${existing.name}» از ${formatMoney(existing.price)} به ${formatMoney(priceData.price)} تغییر کرد`,
      entityType: "Product",
      entityId: id,
      metadata: {
        before: existing.price,
        after: priceData.price,
        exactBefore: existing.priceExact,
        exactAfter: priceData.priceExact,
      },
    });
  }

  return ok(product);
});

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { user, restaurantId } = await requireTab("menu");
  const { id } = await (context as Context).params;

  const existing = await prisma.product.findFirst({
    where: { id, restaurantId },
    select: { id: true, name: true, price: true },
  });
  if (!existing) throw new HttpError(404, "Product not found", "NOT_FOUND");

  // OrderItem.productId is SetNull, so past orders keep their name and price
  // snapshots and reporting stays correct after a menu clean-up.
  await prisma.product.delete({ where: { id } });

  await recordAudit({
    actor: user,
    restaurantId,
    action: "PRODUCT_DELETED",
    summary: `محصول «${existing.name}» حذف شد`,
    entityType: "Product",
    entityId: id,
    metadata: { name: existing.name, price: existing.price },
  });

  return ok({ id });
});
