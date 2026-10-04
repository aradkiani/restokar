import "server-only";
import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import { menuOwnerId } from "./menu";
import { formatMoney } from "./format";
import { HttpError, type TenantContext } from "./auth/guards";
import type { SessionUser } from "./auth/session";
import { lockLevels, postMovements, type StockActor } from "./stock";
import {
  countVariance,
  effectiveUnitCost,
  inventoryLosses,
  purchaseUnitCost,
  valueOf,
  type WasteReason,
} from "./inventory-ledger";
import { isLowStock } from "./inventory";
import { isUnitCode, toItemMilli, type UnitCode } from "./units";
import type { Prisma, StockMovementReason } from "@/generated/prisma/client";

/**
 * Inventory operations: who may touch which shelves, and the reads and writes
 * behind the «انبار» section.
 *
 * Two scopes, kept apart on purpose:
 *
 *  - the **catalogue** — items, units, reference prices, suppliers, recipes —
 *    belongs to the menu owner, because recipes hang off the owner's dishes;
 *  - the **shelves** — stock levels, purchases, waste, counts, the ledger —
 *    belong to a site: a single venue, or one branch of a chain.
 *
 * Every write goes through `postMovements`, the one writer of stock.
 */

export interface StockScope {
  /** The site whose shelves are read or moved. */
  siteId: string;
  /** Whose catalogue the items come from. */
  ownerId: string;
  /** The sites this caller may switch between; one for anyone but a chain owner. */
  sites: { id: string; name: string }[];
}

/**
 * Which shelves a request may act on.
 *
 * Only a chain owner chooses: they may pick their own site or any of their
 * branches. Everyone else — a branch manager, a staff member with the
 * inventory grant — gets the site their session belongs to, whatever they ask
 * for, exactly as every other query in the dashboard is scoped.
 */
export async function resolveStockScope(
  ctx: TenantContext,
  requestedSiteId?: string | null,
): Promise<StockScope> {
  const venue = await prisma.restaurant.findUniqueOrThrow({
    where: { id: ctx.restaurantId },
    select: {
      id: true,
      name: true,
      parentRestaurantId: true,
      branches: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const ownerId = menuOwnerId(venue);

  if (ctx.user.role !== "OWNER" || venue.parentRestaurantId) {
    return { siteId: venue.id, ownerId, sites: [{ id: venue.id, name: venue.name }] };
  }

  const sites = [{ id: venue.id, name: venue.name }, ...venue.branches];
  const chosen = sites.find((site) => site.id === requestedSiteId);
  return { siteId: chosen?.id ?? venue.id, ownerId, sites };
}

/** A supplier id from a request, refused unless it is this owner's. */
export async function assertSupplier(
  ownerId: string,
  supplierId: string | null | undefined,
): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, restaurantId: ownerId },
    select: { id: true },
  });
  if (!supplier) throw new HttpError(404, "Supplier not found", "NOT_FOUND");
  return supplier.id;
}

/** One site's own scope, with no switching — for reports and exports. */
export async function siteScope(siteId: string): Promise<StockScope> {
  const venue = await prisma.restaurant.findUniqueOrThrow({
    where: { id: siteId },
    select: { id: true, name: true, parentRestaurantId: true },
  });
  return {
    siteId: venue.id,
    ownerId: menuOwnerId(venue),
    sites: [{ id: venue.id, name: venue.name }],
  };
}

export function actorOf(user: SessionUser): StockActor {
  return { userId: user.id, label: user.name || user.phone || user.id };
}

const itemPricing = { unit: true, purchasePrice: true, priceUnit: true } as const;

/** Items of the owner's catalogue, refusing any id that is not one of them. */
async function ownedItems(ownerId: string, itemIds: string[]) {
  const unique = [...new Set(itemIds)];
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: unique }, restaurantId: ownerId },
    select: { id: true, name: true, isActive: true, ...itemPricing },
  });
  if (items.length !== unique.length) {
    throw new HttpError(404, "Inventory item not found", "NOT_FOUND");
  }
  return new Map(items.map((item) => [item.id, item]));
}

/** An amount typed in some unit, as thousandths of the item's own unit. */
function amountInItemUnit(
  amount: number,
  entryUnit: string | undefined,
  item: { unit: string; name: string },
): number {
  const itemUnit: UnitCode = isUnitCode(item.unit) ? item.unit : "piece";
  const unit: UnitCode = entryUnit && isUnitCode(entryUnit) ? entryUnit : itemUnit;
  const milli = toItemMilli(amount, unit, itemUnit);
  if (milli === null) {
    throw new HttpError(
      422,
      `مقدار «${item.name}» با واحد آن سازگار نیست`,
      "INVENTORY_UNIT_MISMATCH",
      { name: item.name },
    );
  }
  return milli;
}

// ---------------------------------------------------------------- stock list

export interface StockRow {
  itemId: string;
  name: string;
  unit: string;
  categoryName: string | null;
  supplierName: string | null;
  isActive: boolean;
  quantityMilli: number;
  lowStockMilli: number;
  /** Toman per item unit; the reference price until a purchase sets it. */
  unitCost: number | null;
  /** Whole Toman: quantity × unit cost, zero for stock below nothing. */
  value: number;
  isLow: boolean;
  isNegative: boolean;
}

/** Every catalogue item with what one site holds of it. */
export async function stockList(scope: StockScope): Promise<StockRow[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId: scope.ownerId },
    orderBy: [{ isActive: "desc" }, { categoryName: "asc" }, { name: "asc" }],
    take: 1000,
    select: {
      id: true,
      name: true,
      categoryName: true,
      isActive: true,
      lowStockMilli: true,
      supplier: { select: { name: true } },
      levels: {
        where: { restaurantId: scope.siteId },
        select: { quantityMilli: true, avgCost: true },
      },
      ...itemPricing,
    },
  });

  return items.map((item) => {
    const level = item.levels[0];
    const quantityMilli = level?.quantityMilli ?? 0;
    const unitCost = effectiveUnitCost(level?.avgCost, item);
    return {
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      categoryName: item.categoryName,
      supplierName: item.supplier?.name ?? null,
      isActive: item.isActive,
      quantityMilli,
      lowStockMilli: item.lowStockMilli,
      unitCost,
      value: Math.max(0, valueOf(quantityMilli, unitCost)),
      isLow: isLowStock({ quantityMilli, lowStockMilli: item.lowStockMilli }),
      isNegative: quantityMilli < 0,
    };
  });
}

/** What one site's stock is worth, in whole Toman. */
export function stockValue(rows: readonly StockRow[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}

// ---------------------------------------------------------------- suppliers

export async function listSuppliers(ownerId: string) {
  return prisma.supplier.findMany({
    where: { restaurantId: ownerId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, phone: true, note: true, isActive: true },
  });
}

export async function saveSupplier(
  ownerId: string,
  input: {
    id?: string;
    name: string;
    phone?: string | null;
    note?: string | null;
    isActive?: boolean;
  },
) {
  const clash = await prisma.supplier.findFirst({
    where: {
      restaurantId: ownerId,
      name: input.name,
      NOT: input.id ? { id: input.id } : undefined,
    },
    select: { id: true },
  });
  if (clash) {
    throw new HttpError(409, `«${input.name}» از قبل ثبت شده است`, "SUPPLIER_EXISTS", {
      name: input.name,
    });
  }
  const data = {
    name: input.name,
    phone: input.phone || null,
    note: input.note || null,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
  if (input.id) {
    const owned = await prisma.supplier.findFirst({
      where: { id: input.id, restaurantId: ownerId },
      select: { id: true },
    });
    if (!owned) throw new HttpError(404, "Supplier not found", "NOT_FOUND");
    return prisma.supplier.update({ where: { id: input.id }, data });
  }
  return prisma.supplier.create({ data: { restaurantId: ownerId, ...data } });
}

// ---------------------------------------------------------------- purchases

export interface PurchaseInput {
  supplierId?: string | null;
  purchasedAt: Date;
  invoiceNumber?: string | null;
  paid: boolean;
  note?: string | null;
  lines: { itemId: string; amount: number; unit?: string; lineTotal: number }[];
  /** Also make each line's price the item's reference price. */
  updateReferencePrices?: boolean;
}

/**
 * Books goods in at a site.
 *
 * Each line moves the shelf up and blends its price into the site's average
 * cost. It does **not** touch the reference price that drives menu pricing
 * unless asked: an owner booking one cheap delivery should not find the menu
 * repriced by surprise.
 */
export async function recordPurchase(
  scope: StockScope,
  user: SessionUser,
  input: PurchaseInput,
) {
  const items = await ownedItems(
    scope.ownerId,
    input.lines.map((line) => line.itemId),
  );
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, restaurantId: scope.ownerId },
      select: { id: true },
    });
    if (!supplier) throw new HttpError(404, "Supplier not found", "NOT_FOUND");
  }

  const lines = input.lines.map((line) => {
    const item = items.get(line.itemId)!;
    return {
      ...line,
      item,
      quantityMilli: amountInItemUnit(line.amount, line.unit, item),
      unit: line.unit && isUnitCode(line.unit) ? line.unit : item.unit,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const actor = actorOf(user);

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        restaurantId: scope.siteId,
        supplierId: input.supplierId || null,
        purchasedAt: input.purchasedAt,
        invoiceNumber: input.invoiceNumber || null,
        total,
        paymentStatus: input.paid ? "PAID" : "UNPAID",
        paidAt: input.paid ? new Date() : null,
        note: input.note || null,
        createdById: user.id,
        createdByLabel: actor.label ?? user.id,
        lines: {
          create: lines.map((line) => ({
            itemId: line.itemId,
            quantityMilli: line.quantityMilli,
            unit: line.unit,
            lineTotal: line.lineTotal,
          })),
        },
      },
      select: { id: true },
    });

    await postMovements(tx, {
      siteId: scope.siteId,
      actor,
      movements: lines.map((line) => ({
        itemId: line.itemId,
        deltaMilli: line.quantityMilli,
        reason: "PURCHASE" as const,
        unitCost: purchaseUnitCost(line.lineTotal, line.quantityMilli),
        purchaseId: created.id,
        note: input.invoiceNumber ? `#${input.invoiceNumber}` : null,
      })),
    });

    if (input.updateReferencePrices) {
      for (const line of lines) {
        if (line.lineTotal <= 0) continue;
        // Per the unit the line was typed in, so "20 kg for 900,000" becomes
        // 45,000 a kilogram — the way the owner thinks about the price.
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: {
            purchasePrice: Math.round(line.lineTotal / line.amount),
            priceUnit: line.unit,
            priceUpdatedAt: new Date(),
          },
        });
      }
    }
    return created;
  });

  await recordAudit({
    actor: user,
    restaurantId: scope.siteId,
    action: "PURCHASE_RECORDED",
    summary: `خرید ${formatMoney(total)} تومان ثبت شد (${lines.length} قلم)`,
    entityType: "Purchase",
    entityId: purchase.id,
  });

  return { id: purchase.id, total };
}

export async function listPurchases(siteId: string, take = 50) {
  const rows = await prisma.purchase.findMany({
    where: { restaurantId: siteId },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      purchasedAt: true,
      invoiceNumber: true,
      total: true,
      paymentStatus: true,
      paidAt: true,
      note: true,
      createdByLabel: true,
      supplier: { select: { name: true } },
      lines: {
        select: {
          quantityMilli: true,
          unit: true,
          lineTotal: true,
          item: { select: { name: true, unit: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    purchasedAt: row.purchasedAt.toISOString(),
    invoiceNumber: row.invoiceNumber,
    total: row.total,
    paid: row.paymentStatus === "PAID",
    paidAt: row.paidAt?.toISOString() ?? null,
    note: row.note,
    createdByLabel: row.createdByLabel,
    supplierName: row.supplier?.name ?? null,
    lines: row.lines.map((line) => ({
      name: line.item.name,
      itemUnit: line.item.unit,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      lineTotal: line.lineTotal,
    })),
  }));
}

/** Marks an unpaid invoice paid. Paying is not reversible from here. */
export async function markPurchasePaid(siteId: string, purchaseId: string) {
  const moved = await prisma.purchase.updateMany({
    where: { id: purchaseId, restaurantId: siteId, paymentStatus: "UNPAID" },
    data: { paymentStatus: "PAID", paidAt: new Date() },
  });
  if (moved.count === 0) throw new HttpError(404, "Purchase not found", "NOT_FOUND");
}

// ---------------------------------------------------------------- waste

export async function recordWaste(
  scope: StockScope,
  user: SessionUser,
  input: {
    itemId: string;
    amount: number;
    unit?: string;
    reason: WasteReason;
    note?: string | null;
  },
) {
  const items = await ownedItems(scope.ownerId, [input.itemId]);
  const item = items.get(input.itemId)!;
  const milli = amountInItemUnit(input.amount, input.unit, item);

  const [cost] = await prisma.$transaction((tx) =>
    postMovements(tx, {
      siteId: scope.siteId,
      actor: actorOf(user),
      movements: [
        {
          itemId: input.itemId,
          deltaMilli: -milli,
          reason: "WASTE",
          wasteReason: input.reason,
          note: input.note || null,
        },
      ],
    }),
  );
  const value = valueOf(milli, cost);

  await recordAudit({
    actor: user,
    restaurantId: scope.siteId,
    action: "STOCK_WASTED",
    summary: `ضایعات «${item.name}» به ارزش ${formatMoney(value)} تومان ثبت شد`,
    entityType: "InventoryItem",
    entityId: input.itemId,
  });
  return { value };
}

// ---------------------------------------------------------------- stocktake

/**
 * Posts a physical count.
 *
 * The expected quantity is read under the same lock the adjustment takes, at
 * the moment of posting, so orders placed while somebody was counting are
 * already in it. Items not listed were not counted and are left alone — a
 * count of the fridge is not a claim that the dry store is empty.
 */
export async function postStocktake(
  scope: StockScope,
  user: SessionUser,
  input: { note?: string | null; lines: { itemId: string; counted: number }[] },
) {
  const items = await ownedItems(
    scope.ownerId,
    input.lines.map((line) => line.itemId),
  );
  const actor = actorOf(user);

  const result = await prisma.$transaction(async (tx) => {
    // Locked: the books must not move between this reading and the adjustment.
    const levels = await lockLevels(
      tx,
      scope.siteId,
      input.lines.map((line) => line.itemId),
    );
    const levelOf = new Map(levels.map((level) => [level.itemId, level]));

    const counted = input.lines.map((line) => {
      const item = items.get(line.itemId)!;
      const level = levelOf.get(line.itemId);
      return {
        itemId: line.itemId,
        expectedMilli: level?.quantityMilli ?? 0,
        countedMilli: Math.max(0, Math.round(line.counted * 1_000)),
        unitCost: effectiveUnitCost(level?.avgCost, item),
      };
    });
    const variance = countVariance(counted);

    const stocktake = await tx.stocktake.create({
      data: {
        restaurantId: scope.siteId,
        note: input.note || null,
        createdById: user.id,
        createdByLabel: actor.label ?? user.id,
        lines: { create: counted },
      },
      select: { id: true },
    });

    await postMovements(tx, {
      siteId: scope.siteId,
      actor,
      movements: variance.lines
        .filter((line) => line.deltaMilli !== 0)
        .map((line) => ({
          itemId: line.itemId,
          deltaMilli: line.deltaMilli,
          reason: "STOCKTAKE" as const,
          stocktakeId: stocktake.id,
        })),
    });

    return { id: stocktake.id, shortage: variance.shortage, surplus: variance.surplus };
  });

  await recordAudit({
    actor: user,
    restaurantId: scope.siteId,
    action: "STOCKTAKE_POSTED",
    summary: `انبارگردانی ثبت شد: کسری ${formatMoney(result.shortage)} و مازاد ${formatMoney(result.surplus)} تومان`,
    entityType: "Stocktake",
    entityId: result.id,
  });
  return result;
}

// ---------------------------------------------------------------- ledger

export const MOVEMENT_PAGE_SIZE = 100;

export async function listMovements(
  scope: StockScope,
  filter: {
    itemId?: string | null;
    reason?: StockMovementReason | null;
    after?: string | null;
  },
) {
  const where: Prisma.StockMovementWhereInput = {
    restaurantId: scope.siteId,
    item: { restaurantId: scope.ownerId },
    ...(filter.itemId ? { itemId: filter.itemId } : {}),
    ...(filter.reason ? { reason: filter.reason } : {}),
  };
  /*
    Paged by row id, not by time: one order or one count writes several rows
    with the same timestamp, and a "before this moment" cursor would drop
    whichever of them fell on the page boundary.
  */
  const cursor = filter.after
    ? await prisma.stockMovement.findFirst({
        where: { ...where, id: filter.after },
        select: { id: true },
      })
    : null;
  const rows = await prisma.stockMovement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    take: MOVEMENT_PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      reason: true,
      deltaMilli: true,
      unitCost: true,
      actorLabel: true,
      note: true,
      wasteReason: true,
      orderId: true,
      item: { select: { id: true, name: true, unit: true } },
    },
  });
  // The ledger keeps the order id but no relation to it (an order removed
  // later must not take the shelf history with it), so numbers are looked up.
  const orderIds = [
    ...new Set(rows.map((row) => row.orderId).filter(Boolean)),
  ] as string[];
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true },
      })
    : [];
  const numberOf = new Map(orders.map((order) => [order.id, order.orderNumber]));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    itemId: row.item.id,
    itemName: row.item.name,
    unit: row.item.unit,
    deltaMilli: row.deltaMilli,
    value: valueOf(row.deltaMilli, row.unitCost),
    actorLabel: row.actorLabel,
    note: row.note,
    wasteReason: row.wasteReason,
    orderNumber: row.orderId ? (numberOf.get(row.orderId) ?? null) : null,
  }));
}

// ---------------------------------------------------------------- reporting

/**
 * Waste and count differences at a site over a period, from the ledger.
 *
 * The finance page subtracts these after gross profit. Zero for any period
 * before the first such movement, so historical reports do not change.
 */
export async function periodInventoryLosses(siteId: string, from: Date, to: Date) {
  const rows = await prisma.stockMovement.findMany({
    where: {
      restaurantId: siteId,
      reason: { in: ["WASTE", "STOCKTAKE"] },
      createdAt: { gte: from, lte: to },
    },
    select: { reason: true, deltaMilli: true, unitCost: true },
  });
  return inventoryLosses(rows);
}

/** Purchases at a site over a period, and what is still owed overall. */
export async function purchaseSummary(siteId: string, from: Date, to: Date) {
  const [period, unpaid] = await Promise.all([
    prisma.purchase.aggregate({
      where: { restaurantId: siteId, purchasedAt: { gte: from, lte: to } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.purchase.aggregate({
      where: { restaurantId: siteId, paymentStatus: "UNPAID" },
      _sum: { total: true },
      _count: true,
    }),
  ]);
  return {
    purchases: period._sum.total ?? 0,
    purchaseCount: period._count,
    unpaid: unpaid._sum.total ?? 0,
    unpaidCount: unpaid._count,
  };
}
