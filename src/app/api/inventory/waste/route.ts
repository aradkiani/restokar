import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { WasteSchema } from "@/lib/validation";
import { recordWaste, resolveStockScope } from "@/lib/inventory-server";

export const runtime = "nodejs";

/** Stock thrown away at a site, valued at that site's average cost. */
export const POST = route(async (request: Request) => {
  const ctx = await requireTab("inventory");
  const input = await parseBody(request, WasteSchema);
  const scope = await resolveStockScope(ctx, input.siteId);
  return ok(await recordWaste(scope, ctx.user, input), { status: 201 });
});
