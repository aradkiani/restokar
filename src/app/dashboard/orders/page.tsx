import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { staffCallVisibleSince } from "@/lib/constants";
import { boardInclude, boardWhere, toBoardOrder } from "@/lib/kitchen-board";
import { expireAbandonedOnlineOrders } from "@/lib/orders";
import { soldOutProductIds } from "@/lib/sold-out-server";
import { KitchenBoard, type KitchenOrder } from "./board";

export const metadata: Metadata = { title: "سفارش‌ها" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { restaurantId } = await requirePageTab("orders", "/dashboard/orders");
  const { locale } = await getI18n();

  // Online orders whose guest never finished paying leave the board here.
  await expireAbandonedOnlineOrders(restaurantId);

  // The window and the DTO are shared with /api/orders, so the first paint and
  // the first refresh agree on which orders are on the board.
  const orders = await prisma.order.findMany({
    where: boardWhere(restaurantId),
    orderBy: { placedAt: "desc" },
    take: 100,
    include: boardInclude,
  });

  const initial: KitchenOrder[] = orders.map(toBoardOrder);

  const soldOut = await soldOutProductIds(restaurantId);

  const openCalls = await prisma.staffCall.findMany({
    where: {
      restaurantId,
      acknowledgedAt: null,
      createdAt: { gte: staffCallVisibleSince() },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, tableNumber: true, note: true, kind: true, createdAt: true },
  });

  return (
    <KitchenBoard
      initialOrders={initial}
      initialCalls={openCalls.map((call) => ({
        id: call.id,
        tableNumber: call.tableNumber,
        note: call.note,
        kind: call.kind,
        createdAt: call.createdAt.toISOString(),
      }))}
      locale={locale}
      soldOutCount={soldOut.size}
    />
  );
}
