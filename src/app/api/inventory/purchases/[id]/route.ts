import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { markPurchasePaid, resolveStockScope } from "@/lib/inventory-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const PaidInput = z.object({ paid: z.literal(true), siteId: z.string().optional() });

/** Settling an unpaid invoice. Scoped to the site, so a guessed id is a 404. */
export const PATCH = route(async (request: Request, context: unknown) => {
  const ctx = await requireTab("inventory");
  const { id } = await (context as Context).params;
  const input = await parseBody(request, PaidInput);
  const scope = await resolveStockScope(ctx, input.siteId);
  await markPurchasePaid(scope.siteId, id);
  return ok({ id });
});
