import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { StaffManager } from "./manager";

export const metadata: Metadata = { title: "کارکنان" };
export const dynamic = "force-dynamic";

/**
 * Staff accounts and what each may open. Owner-only: an account that could
 * widen its own access would make every other guard decorative.
 */
export default async function StaffPage() {
  const { restaurantId } = await requirePageOwner("/dashboard/options/staff");

  const staff = await prisma.user.findMany({
    where: { restaurantId, role: "STAFF" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, phone: true, staffTabs: true },
  });

  return <StaffManager initialStaff={staff} />;
}
