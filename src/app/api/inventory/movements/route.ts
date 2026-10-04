import { ok, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { MovementQuerySchema } from "@/lib/validation";
import { listMovements, resolveStockScope } from "@/lib/inventory-server";

export const runtime = "nodejs";

/** The ledger for one site, newest first, a page at a time. */
export const GET = route(async (request: Request) => {
  const ctx = await requireTab("inventory");
  const query = MovementQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const scope = await resolveStockScope(ctx, query.site);
  return ok(
    await listMovements(scope, {
      itemId: query.item,
      reason: query.reason,
      after: query.after,
    }),
  );
});
