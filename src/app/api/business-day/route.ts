import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { BusinessDaySchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { minuteToClock } from "@/lib/business-day";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Setting a site's business-day hours: the owner's own venue, or one of their
 * branches. Only the owner — the hours decide which day every sale is filed
 * under, which is a decision about the books.
 *
 * Changing them affects orders placed from now on. Every order already
 * carries the business date it was filed under, so no past day moves.
 */
export const PUT = route(async (request: Request) => {
  const { user, restaurantId } = await requireOwner();
  const input = await parseBody(request, BusinessDaySchema);

  const siteId = input.siteId ?? restaurantId;
  if (siteId !== restaurantId) {
    const branch = await prisma.restaurant.findFirst({
      where: { id: siteId, parentRestaurantId: restaurantId },
      select: { id: true },
    });
    if (!branch) throw new HttpError(404, "Branch not found", "NOT_FOUND");
  }

  const site = await prisma.restaurant.update({
    where: { id: siteId },
    data: {
      businessDayStart: input.hours?.start ?? null,
      businessDayEnd: input.hours?.end ?? null,
    },
    select: { name: true, businessDayStart: true, businessDayEnd: true },
  });

  await recordAudit({
    actor: user,
    restaurantId: siteId,
    action: "SETTINGS_CHANGED",
    summary: input.hours
      ? `ساعت کاری «${site.name}» شد ${minuteToClock(input.hours.start)} تا ${minuteToClock(input.hours.end)}`
      : `ساعت کاری «${site.name}» برداشته شد`,
    entityType: "Restaurant",
    entityId: siteId,
    ip: clientIp(request),
  });

  return ok({
    businessDayStart: site.businessDayStart,
    businessDayEnd: site.businessDayEnd,
  });
});
