import { z } from "zod";
import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { recordMenuView } from "@/lib/menu-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "A guest opened this menu."
 *
 * Reported from the browser rather than counted while rendering the page,
 * because the menu is served with `revalidate = 60`. A cached render does not
 * execute server code, so counting there would record roughly one view a minute
 * however many people scanned the code — which is the wrong answer by a factor
 * of however busy the venue is.
 *
 * The same contract as the featured and recommendation telemetry beside it:
 * public, rate limited per address, and carrying nothing about the guest. The
 * only thing stored is that the number for this venue on this day went up by
 * one.
 *
 * Counts opens, not people. That is the figure `Plan.maxDailyViews` is written
 * against — it is a capacity ceiling, and capacity is spent per page served.
 */
const MenuViewInput = z.object({
  slug: z.string().min(1),
});

export const POST = route(async (request: Request) => {
  const limit = await rateLimit(`menu-view:${clientIp(request)}`, RATE_LIMITS.menuView);
  if (!limit.allowed) {
    // Quietly, and with a 200. A table of guests sharing one address is normal
    // traffic, and telling a browser its dinner telemetry was throttled is
    // noise in a console nobody is reading. The ceiling exists to bound abuse,
    // not to report it.
    return ok({ recorded: false });
  }

  const input = await parseBody(request, MenuViewInput);

  /*
    Resolved to the venue that was actually opened, not its menu owner: a
    branch and its parent have separate QR codes and separate capacity, and
    rolling a branch's traffic into the chain's total would make the figure
    useless for the one thing it is for.
  */
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: input.slug },
    select: { id: true, isActive: true, isPublished: true, isDemo: true },
  });

  if (!restaurant || !restaurant.isActive || !restaurant.isPublished) {
    return fail(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
  }

  // The homepage showcases the demo venues, so their traffic is the platform's
  // own marketing rather than a customer's. Counting it would put a number on
  // the subscription screen that no restaurant earned.
  if (restaurant.isDemo) return ok({ recorded: false });

  await recordMenuView(restaurant.id);

  return ok({ recorded: true });
});
