import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SupportInbox } from "./inbox";

export const metadata: Metadata = { title: "پشتیبانی" };
export const dynamic = "force-dynamic";

/**
 * The platform's side of support: every venue's tickets in one queue.
 *
 * No guard here on purpose — `/admin/layout.tsx` runs `requirePageAdmin()`
 * before any page in this folder renders, so a page added here is protected by
 * default rather than by someone remembering. This is also the one support view
 * that reads across tenants, which is why it lives under that layout and not in
 * the dashboard.
 */
export default async function AdminSupportPage() {
  const tickets = await prisma.supportTicket.findMany({
    // Open first, then oldest — the queue is worked from the top, and the
    // longest-waiting venue is the one to answer next.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: {
      id: true,
      subject: true,
      message: true,
      status: true,
      reply: true,
      createdAt: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });

  return (
    <SupportInbox
      initialTickets={tickets.map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        reply: ticket.reply,
        createdAt: ticket.createdAt.toISOString(),
        restaurantName: ticket.restaurant.name,
        restaurantSlug: ticket.restaurant.slug,
      }))}
    />
  );
}
