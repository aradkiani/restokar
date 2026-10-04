import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { InventoryItemSchema } from "@/lib/validation";
import { toMilli } from "@/lib/inventory";
import { catalogueItems, postMovements } from "@/lib/stock";
import { unitCost } from "@/lib/costing";
import { actorOf, assertSupplier } from "@/lib/inventory-server";

export const runtime = "nodejs";

/**
 * Ingredient stock for one venue.
 *
 * `requireOwner`: what is on the shelves and what it costs is the owner's
 * business, and the tab lives in More Options alongside the pricing rules for
 * the same reason.
 *
 * Scoped to the session's tenant throughout — a chain's catalogue belongs to
 * the venue that owns the menu, because recipes hang off products and products
 * belong to the menu owner. The quantity shown is the owner's own site; each
 * branch's shelves are read in the inventory section.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireOwner();
  // Archived items keep their history but leave the working list.
  return ok(await catalogueItems(prisma, restaurantId, { isActive: true }));
});

export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireOwner();
  const input = await parseBody(request, InventoryItemSchema);

  // Named per venue, so "آرد" is one shelf rather than three rows nobody can
  // tell apart. Checked before insert for the message; the unique index is what
  // actually guarantees it.
  const clash = await prisma.inventoryItem.findUnique({
    where: { restaurantId_name: { restaurantId, name: input.name } },
    select: { id: true },
  });

  if (clash) {
    return fail(409, `«${input.name}» از قبل ثبت شده است`, "INVENTORY_ITEM_EXISTS");
  }

  // A price typed without its unit is a price for one of the stock unit — the
  // reading an owner who just chose "kilogram" above it means.
  const purchasePrice = input.purchasePrice ?? null;
  const priceUnit = purchasePrice === null ? null : (input.priceUnit ?? input.unit);
  const supplierId = await assertSupplier(restaurantId, input.supplierId);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          restaurantId,
          name: input.name,
          unit: input.unit,
          lowStockMilli: toMilli(input.lowStock),
          purchasePrice,
          priceUnit,
          priceUpdatedAt: purchasePrice === null ? null : new Date(),
          categoryName: input.categoryName || null,
          supplierId,
        },
        select: { id: true },
      });
      /*
        What is on the shelf today is an OPENING row, valued at the price the
        owner just typed, so the ledger sums to the shelf from the first day
        and the average cost starts from something real.
      */
      const quantity = toMilli(input.quantity);
      if (quantity > 0) {
        await postMovements(tx, {
          siteId: restaurantId,
          actor: actorOf(user),
          movements: [
            {
              itemId: item.id,
              deltaMilli: quantity,
              reason: "OPENING",
              unitCost: unitCost({ unit: input.unit, purchasePrice, priceUnit }),
            },
          ],
        });
      }
      const [row] = await catalogueItems(tx, restaurantId, { id: item.id });
      return row;
    });

    return ok(created, { status: 201 });
  } catch (error) {
    if (!(error instanceof Error) || !/Unique constraint|P2002/.test(error.message)) {
      throw error;
    }
    return fail(409, `«${input.name}» از قبل ثبت شده است`, "INVENTORY_ITEM_EXISTS");
  }
});
