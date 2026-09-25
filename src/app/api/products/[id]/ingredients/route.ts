import { ok, route, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { ProductRecipeSchema } from "@/lib/validation";
import { isUnitCode, toItemMilli } from "@/lib/units";
import { recipeCost } from "@/lib/costing";
import { refreshRecipeCosts } from "@/lib/costing-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * A dish's recipe: which ingredients one of it consumes, and how much.
 *
 * Replaced wholesale rather than patched. The owner is looking at a form of
 * ticked ingredients and describing the end state; add/remove operations would
 * let the client's idea of the recipe drift from the server's.
 *
 * Amounts arrive in whatever unit the owner typed — "230 g" of flour stocked in
 * kilograms — and are stored as thousandths of the item's own unit, which is
 * what stock deduction and costing both read. A unit of the wrong kind, or an
 * amount too small to register at the item's resolution, is refused with the
 * ingredient's name rather than stored as a zero that costs and deducts nothing.
 *
 * Saving a recipe recomputes the dish's cost. It does **not** move the dish's
 * price: prices follow ingredient *prices*, and an owner adjusting how much
 * cheese goes on a pizza is describing the dish, not repricing it. If the new
 * recipe leaves the price too thin, the dish editor says so.
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
    select: { id: true, name: true, unit: true, purchasePrice: true, priceUnit: true },
  });
  const byId = new Map(owned.map((item) => [item.id, item]));

  const lines: { itemId: string; perUnitMilli: number; unit: string | null }[] = [];

  for (const line of input.ingredients) {
    const item = byId.get(line.itemId);
    if (!item) continue;

    const itemUnit = isUnitCode(item.unit) ? item.unit : "piece";
    const entryUnit = line.unit ?? itemUnit;
    const perUnitMilli = toItemMilli(line.amount, entryUnit, itemUnit);

    if (perUnitMilli === null) {
      throw new HttpError(
        422,
        `The amount of «${item.name}» cannot be stored in its unit`,
        "RECIPE_AMOUNT_UNREPRESENTABLE",
      );
    }

    lines.push({
      itemId: line.itemId,
      perUnitMilli,
      // Stored only when it differs, so "the item's own unit" stays null and
      // follows the item if its unit is ever converted.
      unit: entryUnit === itemUnit ? null : entryUnit,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.productIngredient.deleteMany({ where: { productId } });
    if (lines.length > 0) {
      await tx.productIngredient.createMany({
        data: lines.map((line) => ({ productId, ...line })),
      });
    }
    await refreshRecipeCosts(tx, restaurantId, [productId]);
  });

  const cost = recipeCost(lines, byId);

  return ok({
    productId,
    count: lines.length,
    cost: cost.cost,
    complete: cost.complete,
    unpricedItemIds: cost.unpricedItemIds,
  });
});
