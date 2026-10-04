import { ok, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { openTabs } from "@/lib/table-tab-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every table with unpaid orders from the last few hours, for the board. */
export const GET = route(async () => {
  const { restaurantId } = await requireTab("orders");
  const tabs = await openTabs(restaurantId);
  return ok(
    tabs.map((tab) => ({
      table: tab.table,
      total: tab.total,
      billRequested: tab.billRequested,
      firstPlacedAt: tab.firstPlacedAt.toISOString(),
      orders: tab.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        status: order.status,
        paymentMethod: order.paymentMethod,
        placedAt: order.placedAt.toISOString(),
      })),
    })),
  );
});
