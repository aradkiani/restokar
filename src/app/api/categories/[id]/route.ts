import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { CategorySchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import {
  replaceSchedule,
  scheduleDiffers,
  scheduleOrderBy,
  scheduleSelect,
} from "@/lib/schedule";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Every write filters on `restaurantId` from the session as well as the id
 * from the URL, so guessing another tenant's category id yields a 404 rather
 * than an edit.
 */
async function assertOwned(restaurantId: string, id: string) {
  const existing = await prisma.category.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      name: true,
      scheduleEnabled: true,
      availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
    },
  });
  if (!existing) throw new HttpError(404, "Category not found", "NOT_FOUND");
  return existing;
}

export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireTab("menu");
  const { id } = await (context as Context).params;
  const existing = await assertOwned(restaurantId, id);

  const input = await parseBody(request, CategorySchema.partial());

  const category = await prisma.$transaction(async (tx) => {
    // Replaced wholesale, in the same transaction as the row it belongs to.
    // Absent means "leave the hours alone"; an empty array clears them.
    if (input.schedule) {
      await replaceSchedule(
        tx,
        restaurantId,
        { kind: "category", categoryId: id },
        input.schedule,
      );
    }

    return tx.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn || null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
        ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl || null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.scheduleEnabled !== undefined
          ? { scheduleEnabled: input.scheduleEnabled }
          : {}),
      },
      include: {
        availabilityWindows: { select: scheduleSelect, orderBy: scheduleOrderBy },
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
      // A category's hours close every dish inside it, so this is worth
      // distinguishing from the same change on a single product.
      summary: `ساعات ارائه دسته‌بندی «${existing.name}» تغییر کرد`,
      entityType: "Category",
      entityId: id,
      metadata: {
        before: {
          scheduleEnabled: existing.scheduleEnabled,
          windows: existing.availabilityWindows.length,
        },
        after: {
          scheduleEnabled: category.scheduleEnabled,
          windows: category.availabilityWindows.length,
        },
      },
    });
  }

  return ok(category);
});

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { user, restaurantId } = await requireTab("menu");
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  // Read before deleting: this is the most destructive action in the menu
  // editor, so the trail records what was lost and how much of it.
  const doomed = await prisma.category.findUnique({
    where: { id },
    select: { name: true, _count: { select: { products: true } } },
  });

  // Products cascade with the category (schema-level onDelete: Cascade);
  // historic order lines keep their snapshots and are unaffected.
  await prisma.category.delete({ where: { id } });

  await recordAudit({
    actor: user,
    restaurantId,
    action: "CATEGORY_DELETED",
    summary: `دسته‌بندی «${doomed?.name ?? id}» به همراه ${doomed?._count.products ?? 0} محصول حذف شد`,
    entityType: "Category",
    entityId: id,
    metadata: { name: doomed?.name, productCount: doomed?._count.products ?? 0 },
  });

  return ok({ id });
});
