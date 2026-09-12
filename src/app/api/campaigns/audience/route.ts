import { ok, parseQuery, route } from "@/lib/api";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { AudienceQuerySchema } from "@/lib/validation";
import { estimateAudience } from "@/lib/campaigns-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * How big an audience would be, while the owner is still choosing.
 *
 * Feeds the live estimate on the campaign form, before anything is saved.
 *
 * **Counts only.** The response is two integers; there is no shape here that
 * could carry a name or a phone number, and no paged variant of it that would.
 * An owner planning a campaign needs the size of the group, not its members.
 *
 * A static segment, so it takes precedence over `[id]` and cannot be reached by
 * guessing a campaign id.
 */
export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const query = parseQuery(request, AudienceQuerySchema);

  // The same ownership check the write paths make: an id from another venue is
  // refused rather than quietly counted against this one. Without it, a caller
  // could probe whether a given product id exists elsewhere by watching the
  // number move.
  if (query.productId) {
    const product = await prisma.product.findFirst({
      where: { id: query.productId, restaurantId },
      select: { id: true },
    });
    if (!product) {
      throw new HttpError(422, "Product not found", "CAMPAIGN_PRODUCT_NOT_FOUND");
    }
  }

  if (query.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: query.categoryId, restaurantId },
      select: { id: true },
    });
    if (!category) {
      throw new HttpError(422, "Category not found", "CAMPAIGN_CATEGORY_NOT_FOUND");
    }
  }

  const audience = await estimateAudience(restaurantId, {
    segment: query.segment,
    productId: query.productId ?? null,
    categoryId: query.categoryId ?? null,
  });

  return ok(audience);
});
