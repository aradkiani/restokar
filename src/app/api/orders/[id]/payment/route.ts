import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { OrderPaymentSchema } from "@/lib/validation";
import { markOrderPaid } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Marks a cash bill settled at the table.
 *
 * `requireTab("orders")` rather than `requireOwner`: taking payment is floor
 * work, and the waiter clearing the table is the person who knows the guest has
 * paid — but only someone who works the order board.
 * The route only ever touches cash orders — see markOrderPaid.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireTab("orders");
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const { paid } = await parseBody(request, OrderPaymentSchema);
  const result = await markOrderPaid(restaurantId, id, paid);

  return ok({ id, ...result });
});
