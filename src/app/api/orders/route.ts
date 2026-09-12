import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/auth/guards";
import { boardInclude, boardWhere, toBoardOrder } from "@/lib/kitchen-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feeds the kitchen board. Staff as well as owners may read this.
 *
 * The window and the DTO both come from `src/lib/kitchen-board.ts`, shared with
 * the server-rendered page, so the first paint and the first refresh cannot
 * disagree about which orders exist or what shape they are in.
 */
export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireTenant();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "active";

  const orders = await prisma.order.findMany({
    where: scope === "active" ? boardWhere(restaurantId) : { restaurantId },
    orderBy: { placedAt: "desc" },
    take: scope === "active" ? 100 : 200,
    include: boardInclude,
  });

  return ok(orders.map(toBoardOrder));
});
