import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { InventoryManager } from "./manager";

export const metadata: Metadata = { title: "موجودی انبار" };
export const dynamic = "force-dynamic";

/**
 * Ingredient stock and dish recipes.
 *
 * The session's tenant *is* the menu owner here: a branch is run by a
 * BRANCH_MANAGER, which cannot reach More Options at all, so an OWNER who gets
 * this far always owns the products these recipes hang off. That is why no
 * `menuOwnerId` resolution is needed, and why the API routes scope the same way.
 *
 * The consequence for chains is worth stating: shelves are shared across the
 * chain rather than kept per branch, because recipes live on the menu and the
 * menu is the chain's.
 */
export default async function InventoryPage() {
  const { restaurantId: ownerId } = await requirePageOwner(
    "/dashboard/options/inventory",
  );

  const [items, products] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { restaurantId: ownerId },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        unit: true,
        quantityMilli: true,
        lowStockMilli: true,
        purchasePrice: true,
        priceUnit: true,
      },
    }),
    prisma.product.findMany({
      where: { restaurantId: ownerId },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        ingredients: { select: { itemId: true, perUnitMilli: true, unit: true } },
      },
    }),
  ]);

  return <InventoryManager initialItems={items} products={products} />;
}
