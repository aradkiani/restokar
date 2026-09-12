import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab, requireTenant } from "@/lib/auth/guards";
import { ProductSchema } from "@/lib/validation";
import { assertCanAddProduct } from "@/lib/plans";
import { scheduleOrderBy, scheduleSelect } from "@/lib/schedule";
import {
  recommendationOrderBy,
  recommendationSelect,
  replaceRecommendations,
} from "@/lib/recommendations-server";

export const runtime = "nodejs";

export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireTenant();
  const categoryId = new URL(request.url).searchParams.get("categoryId");

  const products = await prisma.product.findMany({
    where: { restaurantId, ...(categoryId ? { categoryId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      infoSections: { orderBy: { sortOrder: "asc" } },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { choices: { orderBy: { sortOrder: "asc" } } },
      },
      availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
      recommendations: { select: recommendationSelect, orderBy: recommendationOrderBy },
    },
  });

  return ok(products);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTab("menu");
  await assertCanAddProduct(restaurantId);

  const input = await parseBody(request, ProductSchema);

  // The category must belong to this tenant — otherwise a crafted categoryId
  // would attach a product to somebody else's menu.
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, restaurantId },
    select: { id: true },
  });
  if (!category) throw new HttpError(400, "Category not found", "CATEGORY_NOT_FOUND");

  const last = await prisma.product.findFirst({
    where: { categoryId: input.categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  /*
    A transaction, because suggestions cannot be written with the product.

    Nested `connect` would attach a recommended dish by id without ever proving
    it belongs to this tenant — the one thing that must not be taken on trust
    here. `replaceRecommendations` resolves the targets against the tenant
    first, so a foreign id aborts the whole create instead of producing a
    product wired to another venue's menu.
  */
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        nameEn: input.nameEn || null,
        shortDescription: input.shortDescription || null,
        fullDescription: input.fullDescription || null,
        shortDescriptionEn: input.shortDescriptionEn || null,
        fullDescriptionEn: input.fullDescriptionEn || null,
        // Empty is a real answer — "use the platform's generic phrase" — so it
        // is stored as null rather than as an empty string the menu would have
        // to treat as text.
        pairingNote: input.pairingNote || null,
        pairingNoteEn: input.pairingNoteEn || null,
        imageUrl: input.imageUrl || null,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        costPrice: input.costPrice,
        prepMinutes: input.prepMinutes ?? null,
        isAvailable: input.isAvailable,
        hideWhenUnavailable: input.hideWhenUnavailable,
        isFeatured: input.isFeatured,
        featuredOrder: input.featuredOrder ?? 0,
        featuredLabel: input.featuredLabel ?? null,
        featuredLabelText: input.featuredLabelText || null,
        featuredFrom: input.featuredFrom ?? null,
        featuredUntil: input.featuredUntil ?? null,
        scheduleEnabled: input.scheduleEnabled,
        sortOrder: input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
        /*
        Created with the product rather than in a second write, so a product
        never exists briefly without the hours that govern it.

        `restaurant` is connected explicitly: the tenant column is not inferable
        from the product being created around it, and it must come from the
        session like every other tenant id in this codebase.
      */
        availabilityWindows: {
          create: (input.schedule ?? []).map((window) => ({
            restaurant: { connect: { id: restaurantId } },
            dayOfWeek: window.dayOfWeek,
            startMinute: window.start,
            endMinute: window.end,
          })),
        },
        infoSections: {
          create: input.infoSections.map((section, index) => ({
            title: section.title,
            content: section.content,
            titleEn: section.titleEn || null,
            contentEn: section.contentEn || null,
            icon: section.icon || null,
            sortOrder: index,
          })),
        },
        optionGroups: {
          create: input.optionGroups.map((group, groupIndex) => ({
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
          })),
        },
      },
      select: { id: true },
    });

    if (input.recommendations?.length) {
      await replaceRecommendations(tx, restaurantId, created.id, input.recommendations);
    }

    return tx.product.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        infoSections: { orderBy: { sortOrder: "asc" } },
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { choices: { orderBy: { sortOrder: "asc" } } },
        },
        availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
        recommendations: {
          select: recommendationSelect,
          orderBy: recommendationOrderBy,
        },
      },
    });
  });

  return ok(product, { status: 201 });
});
