import { ok, route, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { ProductRecipeSchema } from "@/lib/validation";
import { toMilli } from "@/lib/inventory";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * A dish's recipe: which ingredients one of it consumes, and how much.
 *
 * Replaced wholesale rather than patched. The owner is looking at a form of
 * ticked ingredients and describing the end state; add/remove operations would
 * let the client's idea of the recipe drift from the server's.
 */
export const PUT = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id: productId } = await (context as Context).params;

  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId },
    select: { id: true },
  });
  if (!product) throw new HttpError(404, "Product not found", "NOT_FOUND");

  const input = await parseBody(request, ProductRecipeSchema);

  /*
    Every referenced item must belong to this tenant.

    The ids arrive in a request body, and a recipe pointing at another venue's
    shelf would deduct their stock every time this dish was ordered. Filtering
    by `restaurantId` here is the same rule the guards apply to everything else:
    an id from the wire is a request, not an authorisation.
  */
  const ids = [...new Set(input.ingredients.map((line) => line.itemId))];
  const owned = await prisma.inventoryItem.findMany({
    where: { id: { in: ids }, restaurantId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((item) => item.id));

  const lines = input.ingredients.filter((line) => ownedIds.has(line.itemId));

  await prisma.$transaction(async (tx) => {
    await tx.productIngredient.deleteMany({ where: { productId } });
    if (lines.length > 0) {
      await tx.productIngredient.createMany({
        data: lines.map((line) => ({
          productId,
          itemId: line.itemId,
          perUnitMilli: toMilli(line.perUnit),
        })),
      });
    }
  });

  return ok({ productId, count: lines.length });
});
