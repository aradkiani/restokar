import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { clientIp } from "@/lib/rate-limit";
import { settleTable } from "@/lib/table-tab-server";

export const runtime = "nodejs";

const SettleInput = z.object({ table: z.string().trim().min(1).max(20) });

/** Marks every open order on one table as paid in cash. */
export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireTab("orders");
  const { table } = await parseBody(request, SettleInput);
  return ok(
    await settleTable({ siteId: restaurantId, table, user, ip: clientIp(request) }),
  );
});
