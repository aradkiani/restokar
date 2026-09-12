import { ok, parseBody, route } from "@/lib/api";
import { requireTenant } from "@/lib/auth/guards";
import { OrderStatusSchema } from "@/lib/validation";
import { updateOrderStatus } from "@/lib/orders";

export const runtime = "nodejs";

/** Kitchen workflow transition. `requireTenant` allows OWNER and STAFF alike. */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireTenant();
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const { status } = await parseBody(request, OrderStatusSchema);
  await updateOrderStatus(restaurantId, id, status);

  return ok({ id, status });
});
