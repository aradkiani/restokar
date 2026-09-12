import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { InventoryItemPatchSchema } from "@/lib/validation";
import { toMilli } from "@/lib/inventory";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function assertOwned(restaurantId: string, id: string) {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, restaurantId },
    select: { id: true, quantityMilli: true },
  });
  if (!existing) throw new HttpError(404, "Inventory item not found", "NOT_FOUND");
  return existing;
}

export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  const existing = await assertOwned(restaurantId, id);

  const input = await parseBody(request, InventoryItemPatchSchema);

  const nextQuantity =
    input.quantity !== undefined ? toMilli(input.quantity) : existing.quantityMilli;

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.quantity !== undefined ? { quantityMilli: nextQuantity } : {}),
        ...(input.lowStock !== undefined
          ? { lowStockMilli: toMilli(input.lowStock) }
          : {}),
      },
      select: {
        id: true,
        name: true,
        unit: true,
        quantityMilli: true,
        lowStockMilli: true,
        isActive: true,
      },
    });

    /*
      A hand-edited count is a movement like any other.

      Without this the ledger would explain every change except the ones a
      person made, and "why is this number different from yesterday?" would have
      no answer precisely when someone had intervened.
    */
    const delta = nextQuantity - existing.quantityMilli;
    if (input.quantity !== undefined && delta !== 0) {
      await tx.stockMovement.create({
        data: { itemId: id, deltaMilli: delta, reason: "MANUAL_ADJUSTMENT" },
      });
    }

    return item;
  });

  return ok(updated);
});

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  // Recipes and movements cascade from the item, so removing an ingredient
  // takes its lines off every dish rather than leaving them pointing nowhere.
  await prisma.inventoryItem.delete({ where: { id } });

  return ok({ id });
});
