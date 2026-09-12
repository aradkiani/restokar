import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Only `isActive` is editable.
 *
 * A code's value is not: orders already carry the amount they were charged, so
 * editing one would leave the list claiming a promotion that no past order
 * matches. Switching a code off and writing a new one keeps the history
 * readable, which is the same reason retired plans are hidden rather than
 * rewritten.
 */
const ToggleInput = z.object({ isActive: z.boolean() });

async function assertOwned(restaurantId: string, id: string) {
  const existing = await prisma.discountCode.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, "Discount code not found", "NOT_FOUND");
}

export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  const input = await parseBody(request, ToggleInput);

  const updated = await prisma.discountCode.update({
    where: { id },
    data: { isActive: input.isActive },
  });

  return ok(updated);
});

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  // Safe to delete outright: orders snapshot the code as text, so removing it
  // cannot rewrite what any guest was charged.
  await prisma.discountCode.delete({ where: { id } });

  return ok({ id });
});
