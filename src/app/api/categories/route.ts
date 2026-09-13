import { z } from "zod";
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

/**
 * The order categories appear in, on the guest menu and everywhere else.
 *
 * Takes the whole list rather than "move this one up", because the whole list
 * is what the owner is looking at and what they mean. Sending one id and a
 * direction would make the server reconstruct the arrangement it was already
 * being shown, and two people reordering at once would interleave into an order
 * neither chose.
 *
 * On the collection rather than at `/categories/reorder`, which would sit in
 * the same path space as `/categories/[id]` and be indistinguishable from a
 * category that happened to be called "reorder".
 *
 * Positions are rewritten from zero on every call, so the stored numbers stay
 * dense and an order built up over many edits never drifts into needing a
 * renumbering pass.
 */
const ReorderInput = z.object({
  order: z.array(z.string().min(1)).min(1).max(200),
});

export const PATCH = route(async (request: Request) => {
  const { restaurantId } = await requireTab("menu");
  const input = await parseBody(request, ReorderInput);

  /*
    Narrowed to this tenant before anything is written. An id belonging to
    another restaurant is dropped rather than refused: the caller learns
    nothing about whether it exists, which is the same answer the rest of the
    API gives to a guessed id.
  */
  const owned = await prisma.category.findMany({
    where: { id: { in: input.order }, restaurantId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((category) => category.id));
  const ordered = input.order.filter((id) => ownedIds.has(id));

  /*
    One transaction: a half-applied reorder would leave two categories holding
    the same position, and which of them came first would then be decided by
    whatever the database felt like returning.

    `updateMany` with the tenant in the filter rather than `update` by id —
    the check above already removed foreign ids, so this is the second lock on
    the same door, and it is the one on the statement that actually writes.
  */
  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.category.updateMany({
        where: { id, restaurantId },
        data: { sortOrder: index },
      }),
    ),
  );

  return ok({ reordered: ordered.length });
});
