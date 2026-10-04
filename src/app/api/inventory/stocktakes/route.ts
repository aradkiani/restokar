import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { StocktakeSchema } from "@/lib/validation";
import { postStocktake, resolveStockScope } from "@/lib/inventory-server";

export const runtime = "nodejs";

/** A physical count at a site, posted in one step. */
export const POST = route(async (request: Request) => {
  const ctx = await requireTab("inventory");
  const input = await parseBody(request, StocktakeSchema);
  const scope = await resolveStockScope(ctx, input.siteId);
  return ok(await postStocktake(scope, ctx.user, input), { status: 201 });
});
