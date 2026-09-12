import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireTab, requireTenant } from "@/lib/auth/guards";
import { CategorySchema } from "@/lib/validation";
import { assertCanAddCategory } from "@/lib/plans";
import { scheduleOrderBy, scheduleSelect } from "@/lib/schedule";

export const runtime = "nodejs";

export const GET = route(async () => {
  const { restaurantId } = await requireTenant();

  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { products: true } },
      availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
    },
  });

  return ok(categories);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTab("menu");
  await assertCanAddCategory(restaurantId);

  const input = await parseBody(request, CategorySchema);

  // New categories go to the end of the list rather than the top.
  const last = await prisma.category.findFirst({
    where: { restaurantId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const category = await prisma.category.create({
    data: {
      restaurantId,
      name: input.name,
      nameEn: input.nameEn || null,
      icon: input.icon || null,
      iconUrl: input.iconUrl || null,
      sortOrder: input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
      isActive: input.isActive ?? true,
      scheduleEnabled: input.scheduleEnabled,
      // Same reasoning as the product route: written with the category, and the
      // tenant id connected from the session rather than inferred.
      availabilityWindows: {
        create: (input.schedule ?? []).map((window) => ({
          restaurant: { connect: { id: restaurantId } },
          dayOfWeek: window.dayOfWeek,
          startMinute: window.start,
          endMinute: window.end,
        })),
      },
    },
    include: {
      availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
    },
  });

  return ok(category, { status: 201 });
});
