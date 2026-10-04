import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { PurchaseSchema } from "@/lib/validation";
import { recordPurchase, resolveStockScope } from "@/lib/inventory-server";

export const runtime = "nodejs";

/** Goods received at a site. The site comes from the session (see resolveStockScope). */
export const POST = route(async (request: Request) => {
  const ctx = await requireTab("inventory");
  const input = await parseBody(request, PurchaseSchema);
  const scope = await resolveStockScope(ctx, input.siteId);
  return ok(
    await recordPurchase(scope, ctx.user, {
      ...input,
      purchasedAt: input.purchasedAt ?? new Date(),
    }),
    { status: 201 },
  );
});
