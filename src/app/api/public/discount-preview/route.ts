import { z } from "zod";
import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { evaluateDiscount, normaliseCode } from "@/lib/discounts";
import { menuOwnerId } from "@/lib/menu";
import { calculatePrice } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a discount code would be worth on this basket.
 *
 * Exists so a guest sees the saving before they commit rather than discovering
 * it on the confirmation screen, and so a refused code says something more
 * useful than "invalid".
 *
 * **It charges nothing and decides nothing.** `createOrder` still resolves the
 * code itself, from its own lookup, and is the only thing that determines what
 * is actually billed. This endpoint is deliberately not on that path: nothing
 * here is consulted at submission, so it cannot change what a guest pays even
 * if it is wrong.
 *
 * The subtotal is supplied by the caller, which is the one thing here that is
 * not read from the database, and it is worth being explicit about why that is
 * acceptable. The figures that decide the answer — whether the code exists, is
 * live, what percentage or amount it carries, its ceiling, and the venue's tax,
 * service charge and rounding — are all read here from the venue's own rows. A
 * caller can only misstate the size of its own basket, and the only thing that
 * buys is a wrong number on its own screen: the order it eventually places is
 * priced from the menu regardless. Re-pricing every line here instead would
 * mean running availability and opening-hours checks that belong to placing an
 * order, and refusing a *preview* because a dish just went off the menu would
 * report the wrong problem.
 */
const DiscountPreviewInput = z.object({
  slug: z.string().min(1),
  code: z.string().trim().max(24),
  /** Whole Toman. Bounded so an absurd basket cannot be used to probe the cap. */
  subtotal: z.number().int().nonnegative().max(2_000_000_000),
  /** Echoed through the same calculation the drawer runs, for a comparable total. */
  tip: z.number().int().nonnegative().max(2_000_000_000).optional(),
});

export const POST = route(async (request: Request) => {
  const limit = await rateLimit(
    `discount-preview:${clientIp(request)}`,
    RATE_LIMITS.discountPreview,
  );
  if (!limit.allowed) {
    return fail(
      429,
      "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      "RATE_LIMITED",
    );
  }

  const input = await parseBody(request, DiscountPreviewInput);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      parentRestaurantId: true,
      isActive: true,
      isPublished: true,
      discountCodesEnabled: true,
      taxEnabled: true,
      taxPercent: true,
      serviceChargeEnabled: true,
      serviceChargePercent: true,
      roundingIncrement: true,
      roundingDirection: true,
      tipEnabled: true,
    },
  });

  if (!restaurant || !restaurant.isActive || !restaurant.isPublished) {
    return fail(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
  }

  // A branch serves its chain's menu, so it serves its chain's codes. Same rule
  // the order pipeline applies, resolved in the same one place.
  const ownerId = menuOwnerId(restaurant);

  /*
    Looked up only once the venue is known to accept codes at all. A venue with
    the feature switched off answers DISABLED without a query, which also means
    a switched-off venue reveals nothing about which codes it has.
  */
  const found = restaurant.discountCodesEnabled
    ? await prisma.discountCode.findUnique({
        where: {
          restaurantId_code: {
            restaurantId: ownerId,
            // The same normalisation the codes were stored with, which is what
            // makes the unique index on (restaurantId, code) match here.
            code: normaliseCode(input.code),
          },
        },
        select: {
          code: true,
          type: true,
          value: true,
          maxDiscount: true,
          isActive: true,
        },
      })
    : null;

  const evaluation = evaluateDiscount({
    enabled: restaurant.discountCodesEnabled,
    raw: input.code,
    subtotal: input.subtotal,
    found,
  });

  /*
    A refused code is an ordinary answer, not a failure: the request was well
    formed and the server answered it. Returning 4xx would put a normal typo
    through the client's error path, where it would read as "something went
    wrong" rather than "that code has expired".
  */
  if (!evaluation.ok) {
    return ok({ valid: false, reason: evaluation.reason });
  }

  const tip = restaurant.tipEnabled ? (input.tip ?? 0) : 0;
  const price = calculatePrice(input.subtotal, restaurant, {
    discount: evaluation.amount,
    tip,
  });

  return ok({
    valid: true,
    // The stored spelling, so the drawer shows the code as the venue wrote it.
    code: evaluation.code,
    discount: price.discount,
    total: price.total,
  });
});
