import "server-only";
import type { Prisma, StockMovementReason } from "@/generated/prisma/client";
import { consumptionFor } from "./inventory";
import { effectiveUnitCost, weightedAverage } from "./inventory-ledger";
import { businessDateKey, dbDate } from "./business-day";
import { getSiteHours } from "./business-day-server";

/**
 * Moving stock, as part of whatever transaction is already open.
 *
 * `postMovements` is the **only** writer of stock. It inserts the ledger row
 * and updates the site's level in the same transaction, so the sum of a site's
 * movements for an item is always its level — nothing else may write either.
 * The arithmetic lives in inventory.ts and inventory-ledger.ts, which have no
 * database import and are tested on their own.
 *
 * Every function takes the transaction client so a shelf can never move
 * without the thing that moved it: a deduction committed beside a failed order
 * would quietly lose inventory nobody cooked.
 */

/**
 * Prisma's own transaction client, so these helpers can only be called from
 * inside a transaction — which is the point.
 */
type StockClient = Prisma.TransactionClient;

/**
 * What the catalogue screen reads back for an item, from every route.
 *
 * Here rather than in a route file: Next.js allows a route module to export
 * only its handlers and route config, and a stray export fails the build.
 */
export const INVENTORY_ITEM_SELECT = {
  id: true,
  name: true,
  unit: true,
  lowStockMilli: true,
  purchasePrice: true,
  priceUnit: true,
  priceUpdatedAt: true,
  isActive: true,
  categoryName: true,
  supplierId: true,
} as const;

/**
 * Catalogue items as the screen reads them: the item, plus what the owner's
 * own site holds of it. Branch stock is read in the inventory section.
 */
export async function catalogueItems(
  client: StockClient | typeof import("./prisma").prisma,
  ownerId: string,
  where: Prisma.InventoryItemWhereInput = {},
) {
  const items = await client.inventoryItem.findMany({
    where: { restaurantId: ownerId, ...where },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 500,
    select: {
      ...INVENTORY_ITEM_SELECT,
      levels: { where: { restaurantId: ownerId }, select: { quantityMilli: true } },
    },
  });
  return items.map(({ levels, ...item }) => ({
    ...item,
    quantityMilli: levels[0]?.quantityMilli ?? 0,
  }));
}

/** Who caused a movement. Orders are moved by the system and pass nothing. */
export interface StockActor {
  userId: string | null;
  label: string | null;
}

export interface MovementInput {
  itemId: string;
  /** Thousandths of the item's unit; negative takes stock away. */
  deltaMilli: number;
  reason: StockMovementReason;
  /**
   * The cost of this movement per item unit, when it is known from outside —
   * what a purchase paid, or what a cancelled order took the stock out at.
   * Stock arriving with a stated cost is blended into the site's average;
   * anything else is valued at the average and leaves it unchanged.
   */
  unitCost?: number | null;
  orderId?: string;
  note?: string | null;
  wasteReason?: string | null;
  purchaseId?: string;
  stocktakeId?: string;
}

interface LockedLevel {
  id: string;
  itemId: string;
  quantityMilli: number;
  avgCost: number | null;
}

/**
 * A site's stock levels for some items, created at zero where missing and
 * locked for the rest of the transaction.
 *
 * Locks are taken in id order, which is what keeps two orders using the same
 * ingredients from deadlocking. Exported for the one caller that must read a
 * level and act on it atomically — a count compares the shelf against the
 * books, and the books must not move between the reading and the adjustment.
 */
export async function lockLevels(
  tx: StockClient,
  siteId: string,
  itemIds: readonly string[],
): Promise<LockedLevel[]> {
  const ids = [...new Set(itemIds)].sort();
  if (ids.length === 0) return [];
  await tx.stockLevel.createMany({
    data: ids.map((itemId) => ({ itemId, restaurantId: siteId })),
    skipDuplicates: true,
  });
  return tx.$queryRaw<LockedLevel[]>`
    SELECT "id", "itemId", "quantityMilli", "avgCost"
      FROM "StockLevel"
     WHERE "restaurantId" = ${siteId} AND "itemId" = ANY(${ids})
     ORDER BY "id"
       FOR UPDATE
  `;
}

/**
 * Applies movements to one site's shelves and records them.
 *
 * The site's level rows are locked for the rest of the transaction before they
 * are read (see `lockLevels`), so two purchases booked at once cannot both read
 * the old average and one overwrite the other.
 *
 * Returns the cost each movement was recorded at, in input order.
 */
export async function postMovements(
  tx: StockClient,
  args: {
    siteId: string;
    movements: readonly MovementInput[];
    actor?: StockActor;
    at?: Date;
  },
): Promise<(number | null)[]> {
  const movements = args.movements.filter((m) => m.deltaMilli !== 0);
  if (movements.length === 0) return args.movements.map(() => null);

  const itemIds = [...new Set(movements.map((m) => m.itemId))];

  const items = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, unit: true, purchasePrice: true, priceUnit: true },
  });
  const itemById = new Map(items.map((item) => [item.id, item]));

  const locked = await lockLevels(tx, args.siteId, itemIds);
  // Filed under the site's business day, like the orders around it.
  const businessDate = dbDate(
    businessDateKey(args.at ?? new Date(), await getSiteHours(args.siteId)),
  );
  const state = new Map(locked.map((level) => [level.itemId, { ...level }]));

  const recordedCost = new Map<MovementInput, number | null>();
  const rows: Prisma.StockMovementCreateManyInput[] = [];

  for (const movement of movements) {
    const level = state.get(movement.itemId);
    const item = itemById.get(movement.itemId);
    if (!level || !item) continue;

    const stated =
      movement.unitCost !== undefined &&
      movement.unitCost !== null &&
      Number.isFinite(movement.unitCost)
        ? movement.unitCost
        : null;
    const cost = stated ?? effectiveUnitCost(level.avgCost, item);

    if (stated !== null && movement.deltaMilli > 0) {
      level.avgCost = weightedAverage(level, {
        quantityMilli: movement.deltaMilli,
        unitCost: stated,
      });
    }
    level.quantityMilli += movement.deltaMilli;
    recordedCost.set(movement, cost);

    rows.push({
      itemId: movement.itemId,
      restaurantId: args.siteId,
      deltaMilli: movement.deltaMilli,
      reason: movement.reason,
      unitCost: cost,
      orderId: movement.orderId ?? null,
      note: movement.note ?? null,
      wasteReason: movement.wasteReason ?? null,
      purchaseId: movement.purchaseId ?? null,
      stocktakeId: movement.stocktakeId ?? null,
      userId: args.actor?.userId ?? null,
      actorLabel: args.actor?.label ?? null,
      businessDate,
      ...(args.at ? { createdAt: args.at } : {}),
    });
  }

  for (const level of state.values()) {
    await tx.stockLevel.update({
      where: { id: level.id },
      data: { quantityMilli: level.quantityMilli, avgCost: level.avgCost },
    });
  }

  await tx.stockMovement.createMany({ data: rows });

  return args.movements.map((m) => recordedCost.get(m) ?? null);
}

/**
 * Takes an order's ingredients off the ordering site's shelves.
 *
 * Recipes belong to the menu owner; the shelf belongs to the site that took
 * the order — a branch's kebab comes out of that branch's fridge. A dish with
 * no recipe contributes nothing, so a venue can track only the ingredients
 * that matter to it.
 */
export async function deductStock(
  tx: StockClient,
  args: {
    menuOwnerId: string;
    siteId: string;
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

  await postMovements(tx, {
    siteId: args.siteId,
    movements: entries.map(([itemId, amount]) => ({
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
 * recipe edited between the order and its cancellation would otherwise return
 * a different amount than was taken — inventing stock that never existed, or
 * swallowing some that did. Goes back to the shelf it came from, at the cost
 * it left at.
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
    select: { itemId: true, deltaMilli: true, restaurantId: true, unitCost: true },
  });
  if (taken.length === 0) return;

  const already = await tx.stockMovement.count({
    where: { orderId, reason: "ORDER_CANCELED" },
  });
  if (already > 0) return;

  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { restaurantId: true },
  });

  const bySite = new Map<string, typeof taken>();
  for (const movement of taken) {
    const site = movement.restaurantId ?? order.restaurantId;
    bySite.set(site, [...(bySite.get(site) ?? []), movement]);
  }

  for (const [siteId, list] of bySite) {
    await postMovements(tx, {
      siteId,
      movements: list.map((movement) => ({
        itemId: movement.itemId,
        // `deltaMilli` is negative for a deduction, so negating it adds back.
        deltaMilli: -movement.deltaMilli,
        reason: "ORDER_CANCELED" as const,
        unitCost: movement.unitCost,
        orderId,
      })),
    });
  }
}

/**
 * Rewrites every stored amount and per-unit cost of an item when its unit
 * changes — kilograms to grams multiplies amounts by 1000 and divides costs by
 * it. The ledger is history, but history *in this unit*: a movement of −230
 * means 230 thousandths of whatever the item is counted in.
 *
 * One statement per table, because a busy ingredient has a movement per order
 * and updating them row by row would hold the transaction open for as long.
 */
export async function convertItemUnit(
  tx: StockClient,
  itemId: string,
  factor: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "StockMovement"
       SET "deltaMilli" = ROUND("deltaMilli" * ${factor}::float8)::int,
           "unitCost" = "unitCost" / ${factor}::float8
     WHERE "itemId" = ${itemId}`;
  await tx.$executeRaw`
    UPDATE "StockLevel"
       SET "quantityMilli" = ROUND("quantityMilli" * ${factor}::float8)::int,
           "avgCost" = "avgCost" / ${factor}::float8
     WHERE "itemId" = ${itemId}`;
  await tx.$executeRaw`
    UPDATE "PurchaseLine"
       SET "quantityMilli" = ROUND("quantityMilli" * ${factor}::float8)::int
     WHERE "itemId" = ${itemId}`;
  await tx.$executeRaw`
    UPDATE "StocktakeLine"
       SET "expectedMilli" = ROUND("expectedMilli" * ${factor}::float8)::int,
           "countedMilli" = ROUND("countedMilli" * ${factor}::float8)::int,
           "unitCost" = "unitCost" / ${factor}::float8
     WHERE "itemId" = ${itemId}`;
}
