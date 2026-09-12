import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { consumptionFor } from "./inventory";

/**
 * Moving stock, as part of whatever transaction is already open.
 *
 * The arithmetic lives in inventory.ts, which has no database import and is
 * tested on its own; this file is only the part that writes. Both functions
 * take the transaction client so a shelf can never move without the order that
 * moved it — a deduction committed beside a failed order would quietly lose
 * inventory nobody cooked.
 */

/**
 * Prisma's own transaction client, so these helpers can only be called from
 * inside a transaction — which is the point.
 */
type StockClient = Prisma.TransactionClient;

/**
 * Takes an order's ingredients off the shelves and records why.
 *
 * A dish with no recipe contributes nothing, so a venue can track only the
 * ingredients that matter to it instead of having to describe its whole menu
 * before stock does anything at all.
 */
export async function deductStock(
  tx: StockClient,
  args: {
    menuOwnerId: string;
    orderId: string;
    lines: { productId: string; quantity: number }[];
  },
): Promise<void> {
  const productIds = [...new Set(args.lines.map((line) => line.productId))];
  if (productIds.length === 0) return;

  const recipes = await tx.productIngredient.findMany({
    where: {
      productId: { in: productIds },
      // Scoped to the tenant that owns the menu, so a recipe can never point at
      // another venue's shelf even if an id were somehow crossed.
      item: { restaurantId: args.menuOwnerId },
    },
    select: { productId: true, itemId: true, perUnitMilli: true },
  });

  if (recipes.length === 0) return;

  const consumption = consumptionFor(args.lines, recipes);
  const entries = Object.entries(consumption);
  if (entries.length === 0) return;

  for (const [itemId, amount] of entries) {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { quantityMilli: { decrement: amount } },
    });
  }

  await tx.stockMovement.createMany({
    data: entries.map(([itemId, amount]) => ({
      itemId,
      deltaMilli: -amount,
      reason: "ORDER_PLACED" as const,
      orderId: args.orderId,
    })),
  });
}

/**
 * Puts back exactly what an order took, when it is cancelled.
 *
 * Reads the recorded movements rather than recomputing from the recipe. A
 * recipe edited between the order and its cancellation would otherwise return a
 * different amount than was taken — inventing stock that never existed, or
 * swallowing some that did. The ledger is the only thing that knows what
 * actually happened.
 *
 * Idempotent by construction: it reverses only `ORDER_PLACED` rows, and the
 * rows it writes are `ORDER_CANCELED`, so running twice cannot double-refund.
 */
export async function restoreStockForOrder(
  tx: StockClient,
  orderId: string,
): Promise<void> {
  const taken = await tx.stockMovement.findMany({
    where: { orderId, reason: "ORDER_PLACED" },
    select: { itemId: true, deltaMilli: true },
  });

  if (taken.length === 0) return;

  const already = await tx.stockMovement.findMany({
    where: { orderId, reason: "ORDER_CANCELED" },
    select: { itemId: true, deltaMilli: true },
  });
  if (already.length > 0) return;

  for (const movement of taken) {
    await tx.inventoryItem.update({
      where: { id: movement.itemId },
      // `deltaMilli` is negative for a deduction, so subtracting it adds back.
      data: { quantityMilli: { increment: -movement.deltaMilli } },
    });
  }

  await tx.stockMovement.createMany({
    data: taken.map((movement) => ({
      itemId: movement.itemId,
      deltaMilli: -movement.deltaMilli,
      reason: "ORDER_CANCELED" as const,
      orderId,
    })),
  });
}
