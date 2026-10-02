import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { OrderStatusSchema } from "@/lib/validation";
import { updateOrderStatus } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Kitchen workflow transition, for anyone holding the `orders` section —
 * owners and branch managers by role, staff by grant. Which moves are allowed
 * is decided by updateOrderStatus.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireTab("orders");
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const { status } = await parseBody(request, OrderStatusSchema);
  await updateOrderStatus(restaurantId, id, status);

  return ok({ id, status });
});
