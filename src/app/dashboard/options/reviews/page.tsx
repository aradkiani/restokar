import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ReviewsList } from "./list";

export const metadata: Metadata = { title: "نظرهای مشتریان" };
export const dynamic = "force-dynamic";

/**
 * What guests said about their meals.
 *
 * Owner-only, like the rest of More Options. A rating is a judgement of the
 * kitchen and the service, and who gets to read the bad ones is the owner's
 * decision to make rather than a default this page invents.
 *
 * Scoped to `restaurantId`, not the menu owner: a branch's reviews are about
 * the branch. The chain's other sites cooked their own dinners.
 */
export default async function ReviewsPage() {
  const { restaurantId } = await requirePageOwner("/dashboard/options/reviews");

  const [reviews, byRating] = await Promise.all([
    prisma.orderReview.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      // Enough to read through in one sitting. The counts below are over every
      // review, so the summary stays honest even when the list is truncated.
      take: 200,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        order: { select: { orderNumber: true, customerName: true } },
      },
    }),
    /*
      Counted in the database rather than from the rows above, so the filter
      chips are right even when there are more than 200 reviews — and so the
      average is an average of all of them, not of the most recent page.
    */
    prisma.orderReview.groupBy({
      by: ["rating"],
      where: { restaurantId },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of byRating) counts[row.rating] = row._count._all;

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const weighted = Object.entries(counts).reduce(
    (sum, [rating, n]) => sum + Number(rating) * n,
    0,
  );

  return (
    <ReviewsList
      counts={counts}
      total={total}
      // Rounded to one decimal here rather than in the client, so the figure
      // shown and the figure counted cannot drift apart.
      average={total > 0 ? Math.round((weighted / total) * 10) / 10 : 0}
      reviews={reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        orderNumber: review.order.orderNumber,
        customerName: review.order.customerName,
      }))}
    />
  );
}
