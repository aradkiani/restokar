import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/auth/guards";
import { staffCallVisibleSince } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open staff calls for the signed-in restaurant.
 *
 * `requireTenant` rather than `requireBranchOperator`: answering a table is exactly the
 * kind of thing anyone working the floor does. The restaurant id comes from the
 * session, so no caller can read another venue's calls.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireTenant();

  const calls = await prisma.staffCall.findMany({
    where: {
      restaurantId,
      acknowledgedAt: null,
      // An unanswered call from hours ago is noise, not a queue.
      createdAt: { gte: staffCallVisibleSince() },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, tableNumber: true, note: true, kind: true, createdAt: true },
  });

  return ok(
    calls.map((call) => ({
      id: call.id,
      tableNumber: call.tableNumber,
      note: call.note,
      kind: call.kind,
      createdAt: call.createdAt.toISOString(),
    })),
  );
});

const AcknowledgeInput = z.object({ id: z.string().min(1) });

/** Marks a call answered. Scoped by tenant so an id alone is not enough. */
export const PATCH = route(async (request: Request) => {
  const { restaurantId } = await requireTenant();
  const input = await parseBody(request, AcknowledgeInput);

  // updateMany with the tenant in the filter: a guessed id from another
  // restaurant simply matches nothing rather than acknowledging their call.
  const { count } = await prisma.staffCall.updateMany({
    where: { id: input.id, restaurantId, acknowledgedAt: null },
    data: { acknowledgedAt: new Date() },
  });

  return ok({ acknowledged: count });
});
