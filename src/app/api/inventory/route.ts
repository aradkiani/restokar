import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { InventoryItemSchema } from "@/lib/validation";
import { toMilli } from "@/lib/inventory";
import { INVENTORY_ITEM_SELECT } from "@/lib/stock";

export const runtime = "nodejs";

/**
 * Ingredient stock for one venue.
 *
 * `requireOwner`: what is on the shelves and what it costs is the owner's
 * business, and the tab lives in More Options alongside the pricing rules for
 * the same reason.
 *
 * Scoped to the session's tenant throughout — a chain's stock belongs to the
 * venue that owns the menu, because recipes hang off products and products
 * belong to the menu owner.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireOwner();

  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 500,
    select: INVENTORY_ITEM_SELECT,
  });

  return ok(items);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
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

  try {
    const created = await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: input.name,
        unit: input.unit,
        quantityMilli: toMilli(input.quantity),
        lowStockMilli: toMilli(input.lowStock),
        purchasePrice,
        priceUnit,
        priceUpdatedAt: purchasePrice === null ? null : new Date(),
      },
      select: INVENTORY_ITEM_SELECT,
    });

    return ok(created, { status: 201 });
  } catch {
    return fail(409, `«${input.name}» از قبل ثبت شده است`, "INVENTORY_ITEM_EXISTS");
  }
});
