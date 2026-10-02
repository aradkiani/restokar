import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { StaffSchema } from "@/lib/validation";
import { exclusiveConflicts, sanitiseTabs } from "@/lib/staff-tabs";

export const runtime = "nodejs";

/**
 * Staff accounts for one venue.
 *
 * `requireOwner` throughout: handing someone the keys to a section is the
 * owner's decision, and an account that could grant itself access would make
 * every other guard decorative.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireOwner();

  const staff = await prisma.user.findMany({
    where: { restaurantId, role: "STAFF" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, phone: true, staffTabs: true, isActive: true },
  });

  return ok(staff);
});

export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireOwner();
  const input = await parseBody(request, StaffSchema);

  const tabs = sanitiseTabs(input.tabs);

  /*
    Phone uniqueness is global, not per tenant: one number is one account
    across the platform, which is what stops a person from being silently
    attached to two venues and seeing whichever the sign-in happened to resolve.

    The one place a registered number shows through, and only to a signed-in
    owner: an account cannot be created on a number another account holds, and
    saying nothing would leave the owner with a form that silently fails.
  */
  const taken = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });
  if (taken) {
    return fail(409, "این شماره قابل استفاده نیست", "PHONE_TAKEN");
  }

  /*
    Orders belongs to one person at a time.

    Checked against everyone else at this venue before the insert. There is a
    race here in principle — two owners saving at the same second — but the
    consequence is two people on one board rather than anything destructive,
    and a database constraint able to express "one row whose array contains
    'orders'" would be a partial index on an expression that Prisma cannot
    describe. The check is where the rule is legible; see also the same check
    on PATCH.
  */
  const others = await prisma.user.findMany({
    where: { restaurantId, role: "STAFF" },
    select: { id: true, staffTabs: true },
  });

  const conflicts = exclusiveConflicts(
    tabs,
    others.map((o) => ({ userId: o.id, staffTabs: o.staffTabs })),
    null,
  );

  if (conflicts.length > 0) {
    return fail(
      409,
      "دسترسی «سفارش‌ها» قبلاً به یک نفر داده شده است",
      "EXCLUSIVE_TAB_TAKEN",
    );
  }

  const created = await prisma.user.create({
    data: {
      name: input.name,
      // Not yet proved: their first sign-in code, sent to this number, is.
      phone: input.phone,
      role: "STAFF",
      restaurantId,
      staffTabs: tabs,
    },
    select: { id: true, name: true, phone: true, staffTabs: true, isActive: true },
  });

  await recordAudit({
    actor: user,
    restaurantId,
    action: "STAFF_CREATED",
    summary: `حساب کارمند ساخته شد: ${created.name} (${created.phone})`,
    entityType: "User",
    entityId: created.id,
    metadata: { tabs },
    ip: clientIp(request),
  });

  return ok(created, { status: 201 });
});
