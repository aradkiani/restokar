import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { StaffAccessSchema } from "@/lib/validation";
import { exclusiveConflicts, tabsForSite } from "@/lib/staff-tabs";
import { staffSites } from "@/lib/staff-sites";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Scoped by tenant *and* by role.
 *
 * `role: "STAFF"` is part of the lookup rather than a check afterwards, so
 * these routes cannot be pointed at the owner's own account or at a branch
 * manager to rewrite their access — an id that is not a staff member of this
 * venue simply does not exist here. "This venue" includes a chain's branches,
 * whose staff the chain owner manages.
 */
async function findStaff(restaurantId: string, ownerId: string, id: string) {
  const sites = await staffSites(restaurantId, ownerId);
  const staff = await prisma.user.findFirst({
    where: { id, restaurantId: { in: sites.map((site) => site.id) }, role: "STAFF" },
    select: { id: true, name: true, phone: true, restaurantId: true },
  });
  if (!staff) throw new HttpError(404, "Staff account not found", "NOT_FOUND");
  const site = sites.find((candidate) => candidate.id === staff.restaurantId)!;
  return { ...staff, site };
}

export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  const staff = await findStaff(restaurantId, user.id, id);

  const input = await parseBody(request, StaffAccessSchema);
  const tabs = tabsForSite(input.tabs, staff.site.isBranch);

  const others = await prisma.user.findMany({
    where: { restaurantId: staff.site.id, role: "STAFF" },
    select: { id: true, staffTabs: true },
  });

  // `id` is passed as the account being edited, so keeping orders ticked on the
  // person who already holds it is not a conflict with themselves.
  const conflicts = exclusiveConflicts(
    tabs,
    others.map((o) => ({ userId: o.id, staffTabs: o.staffTabs })),
    id,
  );

  if (conflicts.length > 0) {
    return fail(
      409,
      "دسترسی «سفارش‌ها» قبلاً به یک نفر داده شده است",
      "EXCLUSIVE_TAB_TAKEN",
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { staffTabs: tabs },
    select: { id: true, name: true, phone: true, staffTabs: true, isActive: true },
  });

  await recordAudit({
    actor: user,
    restaurantId,
    action: "ROLE_CHANGED",
    summary: `دسترسی‌های ${staff.name} تغییر کرد`,
    entityType: "User",
    entityId: id,
    metadata: { tabs },
    ip: clientIp(request),
  });

  return ok({ ...updated, siteId: staff.site.id });
});

export const DELETE = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  const staff = await findStaff(restaurantId, user.id, id);

  /*
    Sessions go with the account, in one transaction.

    Deleting the user alone would leave live session rows pointing at a row
    that no longer exists; getSessionUser would then fail to resolve them,
    which happens to be safe — but relying on a lookup miss for revocation is
    not the same as revoking. Removing both means the person is signed out at
    their next request for a stated reason.
  */
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  await recordAudit({
    actor: user,
    restaurantId,
    action: "STAFF_REMOVED",
    summary: `حساب کارمند حذف شد: ${staff.name} (${staff.phone})`,
    entityType: "User",
    entityId: id,
    ip: clientIp(request),
  });

  return ok({ id });
});
