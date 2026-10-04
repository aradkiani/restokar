import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { clientIp } from "@/lib/rate-limit";
import { setSoldOut, soldOutBoard } from "@/lib/sold-out-server";

export const runtime = "nodejs";

/**
 * The kitchen's "we're out of it" list for this site.
 *
 * Behind the orders section, not the menu one: whoever runs the pass can say a
 * dish is finished for today without being able to rename or reprice it.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireTab("orders");
  return ok(await soldOutBoard(restaurantId));
});

const SoldOutInput = z.object({
  productId: z.string().min(1).max(64),
  soldOut: z.boolean(),
});

export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireTab("orders");
  const input = await parseBody(request, SoldOutInput);
  return ok(
    await setSoldOut({
      siteId: restaurantId,
      productId: input.productId,
      soldOut: input.soldOut,
      user,
      ip: clientIp(request),
    }),
  );
});
