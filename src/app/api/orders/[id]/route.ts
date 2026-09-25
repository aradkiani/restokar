import { ok, route } from "@/lib/api";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { getOrderDetail } from "@/lib/order-detail-server";

export const runtime = "nodejs";

/**
 * One order, in full, for the board's detail view.
 *
 * Behind the `orders` grant — the same grant that opens the board this is
 * reached from. Kitchen staff who can advance a ticket can also read what is on
 * it, including the guest's number, because that is how a venue rings a table
 * about a missing item.
 *
 * `restaurantId` comes from the session, and `getOrderDetail` filters on it, so
 * an id belonging to another venue is a 404 rather than a disclosure.
 */
export const GET = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireTab("orders");
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const order = await getOrderDetail(restaurantId, id);
  if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

  return ok(order);
});
