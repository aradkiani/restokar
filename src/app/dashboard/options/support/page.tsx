import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { SupportPanel } from "./panel";

export const metadata: Metadata = { title: "پشتیبانی" };
export const dynamic = "force-dynamic";

/**
 * The venue's side of support. Owner-only: a ticket is correspondence about the
 * account itself, which is not kitchen business.
 */
export default async function SupportPage() {
  const { restaurantId } = await requirePageOwner("/dashboard/options/support");

  const tickets = await prisma.supportTicket.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      message: true,
      status: true,
      reply: true,
      createdAt: true,
    },
  });

  return (
    <SupportPanel
      initialTickets={tickets.map((ticket) => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      }))}
    />
  );
}
