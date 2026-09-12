import { z } from "zod";
import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { decodeSlug, menuOwnerId } from "@/lib/menu";
import { isFeaturedNow } from "@/lib/featured";

export const runtime = "nodejs";

/**
 * Telemetry for featured dishes on the public menu.
 *
 * The same shape and the same discipline as the suggestion endpoint next to it:
 * unauthenticated, so every field is untrusted; the venue resolved from the
 * slug rather than taken from the caller; idempotent per session; rate limited.
 *
 * The one difference is what gets verified. A suggestion is confirmed by the
 * existence of an edge; a featured dish is confirmed by the dish actually being
 * promoted *at this moment* — which is the same `isFeaturedNow` the menu
 * rendered from, so an expired promotion stops accepting events the instant it
 * stops being shown.
 *
 * Purchases are not reportable here. Those are written by `createOrder` from
 * facts the server already holds.
 */
const EventSchema = z.object({
  slug: z.string().min(1),
  productId: z.string().min(1).max(40),
  type: z.enum(["IMPRESSION", "VIEW", "ADD_TO_CART"]),
  /** Opaque per-guest-session id, shared with the suggestion events. */
  sessionKey: z.string().min(8).max(64),
});

export const POST = route(async (request: Request) => {
  const limit = await rateLimit(
    `featured-event:${clientIp(request)}`,
    RATE_LIMITS.recommendationEvent,
  );
  if (!limit.allowed) return fail(429, "Too many requests", "RATE_LIMITED");

  const input = await parseBody(request, EventSchema);

  const venue = await prisma.restaurant.findUnique({
    where: { slug: decodeSlug(input.slug) },
    select: { id: true, parentRestaurantId: true, isActive: true },
  });

  // One shape of refusal, so probing reveals nothing about which slugs exist.
  if (!venue || !venue.isActive) return ok({ recorded: false });

  /*
    Filed under whoever owns the menu.

    A branch serves the chain's dishes and the promotion being measured is the
    chain's, so recording against the branch would scatter one menu's
    merchandising across every site that serves it.
  */
  const ownerId = menuOwnerId(venue);

  /*
    The dish must belong to that menu and be promoted right now.

    This is what stops the endpoint being a way to write arbitrary rows, and
    what keeps the numbers meaningful: an event for a dish whose promotion ended
    an hour ago is not evidence of anything.
  */
  const product = await prisma.product.findFirst({
    where: { id: input.productId, restaurantId: ownerId },
    select: {
      isFeatured: true,
      featuredFrom: true,
      featuredUntil: true,
      isAvailable: true,
    },
  });

  if (!product || !isFeaturedNow(product, new Date())) {
    return ok({ recorded: false });
  }

  /*
    `createMany` with `skipDuplicates` rather than an upsert: the unique index
    is the deduplication, and a repeat is the normal consequence of a guest
    refreshing rather than an error worth reporting to a menu.
  */
  const result = await prisma.featuredProductEvent.createMany({
    data: [
      {
        restaurantId: ownerId,
        productId: input.productId,
        type: input.type,
        sessionKey: input.sessionKey,
      },
    ],
    skipDuplicates: true,
  });

  return ok({ recorded: result.count > 0 });
});
