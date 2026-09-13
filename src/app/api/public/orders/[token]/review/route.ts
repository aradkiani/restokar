import { z } from "zod";
import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A guest rating the meal they were just served.
 *
 * Authorised by the order's `publicToken` — the unguessable string in the link
 * they were given when they ordered, and the same proof the status page already
 * runs on. No account, no email, no login: the person who can see the order is
 * the person who placed it.
 *
 * The token is the whole of the authorisation, which is why the order is looked
 * up by it rather than by anything in the body. A caller cannot nominate which
 * order they are rating.
 */
const ReviewInput = z.object({
  rating: z
    .number()
    .int()
    .min(1, "امتیاز باید بین ۱ تا ۵ باشد")
    .max(5, "امتیاز باید بین ۱ تا ۵ باشد"),
  /**
   * Optional, and bounded. Most people rate and say nothing; the ones who write
   * are writing a sentence or two about a meal, not an essay.
   */
  comment: z.string().trim().max(1000, "نظر شما بیش از حد بلند است").optional(),
});

export const POST = route(async (request: Request, context: unknown) => {
  const { params } = context as { params: Promise<{ token: string }> };
  const { token } = await params;

  const limit = await rateLimit(`review:${clientIp(request)}`, RATE_LIMITS.review);
  if (!limit.allowed) {
    return fail(
      429,
      "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      "RATE_LIMITED",
    );
  }

  const input = await parseBody(request, ReviewInput);

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, restaurantId: true, status: true },
  });

  if (!order) return fail(404, "Order not found", "ORDER_NOT_FOUND");

  /*
    Only once the meal has actually arrived.

    Not merely a UI nicety: a rating left while the food is still being cooked
    is a rating of the wait, and the owner reading "2 stars" has no way to tell
    the two apart. The status page only offers the form when it sees DELIVERED,
    so reaching this is a stale tab or a hand-made request.
  */
  if (order.status !== "DELIVERED") {
    return fail(409, "این سفارش هنوز تحویل نشده است", "ORDER_NOT_DELIVERED");
  }

  /*
    Upsert, so a guest who rates 3 and then thinks better of it corrects their
    own review rather than creating a second one. `orderId` is unique, which is
    what makes that a correction rather than a race.

    `restaurantId` comes from the order — for a branch that is the branch, which
    is where the meal was actually cooked and served, even though the menu
    belongs to the chain.
  */
  const review = await prisma.orderReview.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      restaurantId: order.restaurantId,
      rating: input.rating,
      comment: input.comment || null,
    },
    update: {
      rating: input.rating,
      comment: input.comment || null,
    },
    select: { rating: true, comment: true },
  });

  return ok(review, { status: 201 });
});
