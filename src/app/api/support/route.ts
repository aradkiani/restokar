import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { SupportTicketSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Support tickets, from one venue's side.
 *
 * `requireOwner`: a ticket is correspondence between the venue and the platform
 * about that venue's account, so it is the owner's to open and to read. The
 * tenant comes from the session, which is also what scopes the list below —
 * there is no id in the URL that could address another venue's tickets.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireOwner();

  const tickets = await prisma.supportTicket.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok(tickets);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();

  /*
    Rate limited like the guest order endpoint. This one writes a row on every
    call and is read by a human, so an accidental loop in a client would both
    fill the table and bury the inbox that platform staff work from.
  */
  const limit = await rateLimit(`support:${clientIp(request)}`, RATE_LIMITS.placeOrder);
  if (!limit.allowed) {
    return fail(
      429,
      "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      "RATE_LIMITED",
    );
  }

  const input = await parseBody(request, SupportTicketSchema);

  const ticket = await prisma.supportTicket.create({
    data: {
      restaurantId,
      subject: input.subject,
      message: input.message,
    },
  });

  return ok(ticket, { status: 201 });
});
