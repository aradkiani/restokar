import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { BulkPriceSchema } from "@/lib/validation";
import { adjustAll, summarise } from "@/lib/bulk-pricing";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { MAX_INT4 } from "@/lib/constants";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/**
 * Raises (or lowers) every price on the menu at once.
 *
 * `apply: false` computes the change and writes nothing — the same call the
 * form makes to build its preview. The preview and the write therefore come
 * from one code path and one function (`adjustAll`), which is the only way a
 * preview can be trusted to describe what is about to happen.
 *
 * Owner-only. Kitchen staff move orders; nobody but the owner re-prices a menu.
 */
export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireOwner();
  const input = await parseBody(request, BulkPriceSchema);

  // Modest ceiling: this is a legitimate action, but it rewrites every price on
  // the menu, and a script hammering it would be doing so irreversibly.
  const limit = await rateLimit(`bulk-price:${restaurantId}`, {
    limit: 20,
    windowSeconds: 300,
  });
  if (!limit.allowed) return fail(429, "تعداد درخواست‌ها زیاد است.", "RATE_LIMITED");

  const products = await prisma.product.findMany({
    where: { restaurantId },
    // `compareAtPrice` moves with the price: a discount is the relationship
    // between the two, and raising only one rewrites the offer.
    select: { id: true, name: true, price: true, compareAtPrice: true },
    orderBy: { name: "asc" },
  });

  const adjusted = adjustAll(products, {
    percent: input.percent,
    roundTo: input.roundTo,
  });
  const summary = summarise(adjusted);

  // Every money column is a Postgres integer. A percentage applied to an
  // already-large price is one of the few ways to derive a value past the
  // ceiling, and it would fail mid-transaction rather than cleanly.
  const tooLarge = adjusted.find(
    (item) => item.nextPrice > MAX_INT4 || (item.nextCompareAtPrice ?? 0) > MAX_INT4,
  );
  if (tooLarge) {
    return fail(
      422,
      `قیمت «${tooLarge.name}» پس از افزایش بیش از حد بزرگ می‌شود`,
      "PRICE_TOO_LARGE",
    );
  }

  const changes = adjusted.filter((item) => item.changed);

  if (!input.apply) {
    return ok({
      applied: false,
      summary,
      // A sample, not the whole menu: the form shows a handful of rows so the
      // owner can recognise the shape of the change, and a 300-item payload
      // would be shipped to the browser to render twelve lines of it.
      preview: changes.slice(0, 8).map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        nextPrice: item.nextPrice,
        compareAtPrice: item.compareAtPrice ?? null,
        nextCompareAtPrice: item.nextCompareAtPrice,
      })),
    });
  }

  if (changes.length === 0) {
    return ok({ applied: true, summary, preview: [] });
  }

  /**
   * One transaction, so the menu is never half re-priced.
   *
   * Written as individual updates rather than a single `updateMany` because
   * each row gets a different value; grouping by target price would be fewer
   * statements but would obscure which product got which price if it failed.
   */
  await prisma.$transaction(
    changes.map((item) =>
      prisma.product.update({
        where: { id: item.id },
        data: { price: item.nextPrice, compareAtPrice: item.nextCompareAtPrice },
      }),
    ),
  );

  await recordAudit({
    actor: user,
    restaurantId,
    action: "PRICES_BULK_ADJUSTED",
    summary:
      `قیمت ${changes.length} محصول ${input.percent >= 0 ? "افزایش" : "کاهش"} ` +
      `${Math.abs(input.percent)} درصدی یافت` +
      (input.roundTo > 0 ? ` (رُند شده به ${input.roundTo})` : ""),
    entityType: "Product",
    metadata: {
      percent: input.percent,
      roundTo: input.roundTo,
      changed: summary.changed,
      total: summary.total,
      sumBefore: summary.before,
      sumAfter: summary.after,
    },
    ip: clientIp(request),
  });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true },
  });
  if (restaurant) revalidatePath(`/menu/${restaurant.slug}`);

  return ok({ applied: true, summary, preview: [] });
});
