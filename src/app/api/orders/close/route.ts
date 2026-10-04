import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { clientIp } from "@/lib/rate-limit";
import { dayStart } from "@/lib/cash-close";
import { closeDay } from "@/lib/cash-close-server";

export const runtime = "nodejs";

const CloseInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countedCash: z.number().int().min(0).max(100_000_000_000),
  note: z.string().trim().max(500).optional(),
});

/**
 * Records the end-of-day close for this site. Staff on the orders board can do
 * it — the cashier is the one who counts the till — and the site always comes
 * from the session, so a branch closes only itself.
 */
export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireTab("orders");
  const input = await parseBody(request, CloseInput);
  return ok(
    await closeDay({
      siteId: restaurantId,
      start: dayStart(input.day),
      countedCash: input.countedCash,
      note: input.note || null,
      user,
      ip: clientIp(request),
    }),
  );
});
