import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireAdmin } from "@/lib/auth/guards";
import { SupportReplySchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Platform staff answering a ticket.
 *
 * `requireAdmin`, and no tenant scoping — this is the one side of support that
 * reads across venues, which is exactly why it is behind the admin guard rather
 * than a widened tenant one. Answering marks the ticket ANSWERED unless the
 * admin explicitly closes it, so a reply cannot silently leave the queue
 * looking untouched.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  await requireAdmin();
  const { id } = await (context as Context).params;

  const existing = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, "Ticket not found", "NOT_FOUND");

  const input = await parseBody(request, SupportReplySchema);

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      reply: input.reply,
      repliedAt: new Date(),
      status: input.status ?? "ANSWERED",
    },
  });

  return ok(ticket);
});
