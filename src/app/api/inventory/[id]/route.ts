import { revalidatePath } from "next/cache";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { InventoryItemPatchSchema } from "@/lib/validation";
import { toMilli } from "@/lib/inventory";
import { convert, isUnitCode, sameDimension, type UnitCode } from "@/lib/units";
import { MAX_INT4 } from "@/lib/constants";
import {
  priceAlerts,
  productsUsing,
  refreshRecipeCosts,
  repriceForIngredient,
  type RepricedProduct,
} from "@/lib/costing-server";
import { INVENTORY_ITEM_SELECT } from "@/lib/stock";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function assertOwned(restaurantId: string, id: string) {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      name: true,
      unit: true,
      quantityMilli: true,
      lowStockMilli: true,
      purchasePrice: true,
      priceUnit: true,
    },
  });
  if (!existing) throw new HttpError(404, "Inventory item not found", "NOT_FOUND");
  return existing;
}

/**
 * Editing an ingredient: its stock, its unit, and what it costs.
 *
 * A price change here can move menu prices. When the venue has automatic
 * repricing on, every dish using this ingredient rises or falls by exactly the
 * change in its own ingredient cost (`costing.ts`), in the same transaction as
 * the price itself — a menu can never show a new price for an ingredient
 * change that did not commit. The response lists what moved, so the owner sees
 * the consequence on the screen where they caused it.
 *
 * The order inside the transaction is load-bearing:
 *
 *   1. **Reprice**, against the *current* stock unit and recipe amounts.
 *   2. **Convert** stock, recipes and history if the stock unit changed.
 *   3. **Recompute** each affected dish's cost from what is now stored.
 *
 * Repricing after the conversion would compare a price per kilogram against
 * amounts already rewritten in grams.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  const existing = await assertOwned(restaurantId, id);
  const input = await parseBody(request, InventoryItemPatchSchema);

  const currentUnit: UnitCode = isUnitCode(existing.unit) ? existing.unit : "piece";
  const nextUnit: UnitCode = input.unit ?? currentUnit;
  const unitChanged = nextUnit !== currentUnit;

  // --------------------------------------------------------------- units
  //
  // Before the price check: an in-use ingredient changing kind is the real
  // reason such an edit fails, and reporting a price-unit mismatch instead
  // would send the owner to fix the wrong field.
  const usedBy = await productsUsing(prisma, restaurantId, id);

  let factor = 1;
  if (unitChanged) {
    if (!sameDimension(currentUnit, nextUnit)) {
      // Kilograms cannot become pieces. Allowed only for an item nothing yet
      // depends on — typically one created with the wrong unit a moment ago.
      const untouched =
        usedBy.length === 0 &&
        existing.quantityMilli === 0 &&
        existing.lowStockMilli === 0 &&
        existing.purchasePrice === null;
      if (!untouched) {
        throw new HttpError(
          409,
          "An ingredient in use cannot change to a different kind of unit",
          "INVENTORY_UNIT_KIND_CHANGE",
        );
      }
    } else {
      factor = convert(1, currentUnit, nextUnit)!;
    }
  }

  // ------------------------------------------------------------- pricing
  const nextPrice =
    input.purchasePrice !== undefined ? input.purchasePrice : existing.purchasePrice;
  const nextPriceUnit =
    nextPrice === null
      ? null
      : input.priceUnit !== undefined && input.priceUnit !== null
        ? input.priceUnit
        : (existing.priceUnit ?? nextUnit);

  if (
    nextPriceUnit !== null &&
    !(isUnitCode(nextPriceUnit) && sameDimension(nextPriceUnit, nextUnit))
  ) {
    throw new HttpError(
      422,
      "Price unit must match the stock unit's kind",
      "INVENTORY_PRICE_UNIT_MISMATCH",
    );
  }

  const priceChanged =
    nextPrice !== existing.purchasePrice || nextPriceUnit !== existing.priceUnit;

  const scale = (milli: number) => Math.round(milli * factor);

  const result = await prisma.$transaction(async (tx) => {
    const venue = await tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: {
        slug: true,
        menuPriceStep: true,
        autoRepriceFromCost: true,
        lowMarginPercent: true,
      },
    });

    // 1. Reprice, against the unit the recipes are still written in.
    let repriced: RepricedProduct[] = [];
    if (priceChanged && venue.autoRepriceFromCost) {
      repriced = await repriceForIngredient(tx, {
        restaurantId,
        itemId: id,
        before: {
          unit: currentUnit,
          purchasePrice: existing.purchasePrice,
          priceUnit: existing.priceUnit,
        },
        // The same stock unit on both sides: a price is per real quantity, so
        // the unit changing in the same edit moves no dish.
        after: { unit: currentUnit, purchasePrice: nextPrice, priceUnit: nextPriceUnit },
        step: venue.menuPriceStep,
      });
    }

    // 2. Convert everything held in thousandths of the old unit.
    if (unitChanged && factor !== 1) {
      const lines = await tx.productIngredient.findMany({
        where: { itemId: id },
        select: { id: true, perUnitMilli: true },
      });

      for (const line of lines) {
        const converted = scale(line.perUnitMilli);
        // Kilograms → grams can only grow a number; grams → kilograms can shrink
        // a recipe amount below the resolution, and a zero would cost nothing
        // while the owner believes it costs something.
        if (converted <= 0) {
          throw new HttpError(
            409,
            "A recipe amount would be too small in that unit",
            "INVENTORY_UNIT_TOO_COARSE",
          );
        }
        if (converted > MAX_INT4) {
          throw new HttpError(
            409,
            "An amount would be too large in that unit",
            "INVENTORY_UNIT_OVERFLOW",
          );
        }
        await tx.productIngredient.update({
          where: { id: line.id },
          data: { perUnitMilli: converted },
        });
      }

      // The ledger is history, but it is history *in this unit*: a movement
      // of −230 means 230 thousandths of whatever the item is counted in.
      // One statement, because a busy ingredient has a movement per order and
      // updating them row by row would hold this transaction open for as long.
      await tx.$executeRaw`
        UPDATE "StockMovement"
           SET "deltaMilli" = ROUND("deltaMilli" * ${factor}::float8)::int
         WHERE "itemId" = ${id}
      `;
    }

    const convertedQuantity = scale(existing.quantityMilli);
    const convertedLow = scale(existing.lowStockMilli);
    if (convertedQuantity > MAX_INT4 || convertedLow > MAX_INT4) {
      throw new HttpError(
        409,
        "An amount would be too large in that unit",
        "INVENTORY_UNIT_OVERFLOW",
      );
    }

    // A quantity typed in the same request is in the unit it was typed beside.
    const nextQuantity =
      input.quantity !== undefined ? toMilli(input.quantity) : convertedQuantity;

    const item = await tx.inventoryItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        unit: nextUnit,
        quantityMilli: nextQuantity,
        lowStockMilli:
          input.lowStock !== undefined ? toMilli(input.lowStock) : convertedLow,
        purchasePrice: nextPrice,
        priceUnit: nextPriceUnit,
        ...(priceChanged ? { priceUpdatedAt: new Date() } : {}),
      },
      select: INVENTORY_ITEM_SELECT,
    });

    /*
      A hand-edited count is a movement like any other.

      Without this the ledger would explain every change except the ones a
      person made, and "why is this number different from yesterday?" would have
      no answer precisely when someone had intervened.
    */
    const delta = nextQuantity - convertedQuantity;
    if (input.quantity !== undefined && delta !== 0) {
      await tx.stockMovement.create({
        data: { itemId: id, deltaMilli: delta, reason: "MANUAL_ADJUSTMENT" },
      });
    }

    // 3. Recompute cost from what is now stored.
    await refreshRecipeCosts(tx, restaurantId, usedBy);
    const alerts = priceChanged
      ? await priceAlerts(tx, restaurantId, usedBy, venue.lowMarginPercent)
      : [];

    return {
      item,
      repriced,
      alerts,
      slug: venue.slug,
      autoReprice: venue.autoRepriceFromCost,
    };
  });

  if (priceChanged) {
    // The audit trail is where an owner looks when a dish's price changed and
    // nobody remembers changing it. An automatic change must be as findable
    // as a manual one, with the ingredient that caused it.
    await recordAudit({
      actor: user,
      restaurantId,
      action: "PRICE_CHANGED",
      summary:
        `قیمت خرید «${existing.name}» تغییر کرد` +
        (result.repriced.length > 0
          ? ` و قیمت ${result.repriced.length} محصول خودکار به‌روز شد`
          : ""),
      entityType: "InventoryItem",
      entityId: id,
      metadata: {
        before: { purchasePrice: existing.purchasePrice, priceUnit: existing.priceUnit },
        after: { purchasePrice: nextPrice, priceUnit: nextPriceUnit },
        repriced: result.repriced.map((p) => ({
          id: p.id,
          before: p.priceBefore,
          after: p.priceAfter,
          exactBefore: p.priceExactBefore,
          exactAfter: p.priceExactAfter,
        })),
      },
    });
  }

  if (result.repriced.length > 0) revalidatePath(`/menu/${result.slug}`);

  return ok({
    item: result.item,
    repriced: result.repriced,
    alerts: result.alerts,
    autoReprice: result.autoReprice,
  });
});

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  await prisma.$transaction(async (tx) => {
    // Read before the delete: recipe lines cascade with the item, and the
    // dishes that lose a line need their cost recomputed without it. Their
    // price does not move — removing an ingredient from the books is not a
    // change in what it costs.
    const usedBy = await productsUsing(tx, restaurantId, id);
    await tx.inventoryItem.delete({ where: { id } });
    await refreshRecipeCosts(tx, restaurantId, usedBy);
  });

  return ok({ id });
});
