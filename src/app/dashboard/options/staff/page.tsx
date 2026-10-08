import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { StaffManager } from "./manager";
import { staffSites } from "@/lib/staff-sites";

export const metadata: Metadata = { title: "کارکنان" };
export const dynamic = "force-dynamic";

/**
 * Staff accounts and what each may open. Owner-only: an account that could
 * widen its own access would make every other guard decorative.
 */
export default async function StaffPage() {
  const { user, restaurantId } = await requirePageOwner("/dashboard/options/staff");
  // A chain owner also staffs the branches, each account at its own site.
  const sites = await staffSites(restaurantId, user.id);

  const staff = await prisma.user.findMany({
    where: { restaurantId: { in: sites.map((site) => site.id) }, role: "STAFF" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, phone: true, staffTabs: true, restaurantId: true },
  });

  return (
    <StaffManager
      sites={sites}
      initialStaff={staff.map(({ restaurantId: siteId, ...row }) => ({
        ...row,
        siteId: siteId ?? restaurantId,
      }))}
    />
  );
}
