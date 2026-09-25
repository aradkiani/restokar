import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  applyCostDelta,
  passThroughDelta,
  priceHealth,
  recipeCost,
  shownPrices,
  type PriceWarning,
  type PricedIngredient,
} from "./costing";

/**
 * The database half of ingredient costing. The rules are in `costing.ts`; this
 * is where they are applied to rows.
 *
 * Every function takes the transaction client, so a dish's price can never
 * move without the ingredient change that moved it: the two commit together or
 * not at all. Every function is also scoped by `restaurantId`, which callers
 * take from the session — the same tenant rule as everything else.
 */

type Tx = Prisma.TransactionClient;

const PRICE_SELECT = {
  id: true,
  name: true,
  price: true,
  priceExact: true,
  compareAtPrice: true,
  compareAtPriceExact: true,
} as const;

// ------------------------------------------------------------ recipe cost

/**
 * Recomputes the ingredient cost of these dishes.
 *
 * A dish whose recipe is complete — every ingredient priced — gets that cost
 * as its `costPrice`, and `costFromRecipe` is set so the owner's typed figure is
 * no longer accepted over it. A dish whose recipe is empty or incomplete keeps
 * whatever cost it last had and becomes editable again: a partial sum would
 * understate the cost, and understating cost is how a loss reads as a margin.
 *
 * `costPrice` is whole Toman because that is what an order snapshots; the exact
 * figure is recomputed from the recipe whenever it is needed.
 */
export async function refreshRecipeCosts(
  tx: Tx,
  restaurantId: string,
  productIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: ids }, restaurantId },
    select: {
      id: true,
      costPrice: true,
      costFromRecipe: true,
      ingredients: {
        select: {
          itemId: true,
          perUnitMilli: true,
          item: { select: { unit: true, purchasePrice: true, priceUnit: true } },
        },
      },
    },
  });

  for (const product of products) {
    const items = new Map(product.ingredients.map((line) => [line.itemId, line.item]));
    const result = recipeCost(product.ingredients, items);

    const next = result.complete
      ? { costPrice: Math.round(result.cost), costFromRecipe: true }
      : { costPrice: product.costPrice, costFromRecipe: false };

    if (
      next.costPrice !== product.costPrice ||
      next.costFromRecipe !== product.costFromRecipe
    ) {
      await tx.product.update({ where: { id: product.id }, data: next });
    }
  }
}

// ------------------------------------------------------------ pass-through

export interface RepricedProduct {
  id: string;
  name: string;
  priceBefore: number;
  priceAfter: number;
  priceExactBefore: number;
  priceExactAfter: number;
  /** The change in this dish's ingredient cost, and so in its exact price. */
  delta: number;
}

/**
 * Moves every dish that uses an ingredient by the change in its own cost.
 *
 * `before` and `after` are the ingredient's pricing either side of the edit,
 * both expressed against the *same* stock unit — the caller converts a unit
 * change separately, and it moves no price, because the ingredient costs the
 * same per kilogram whether it is counted in grams or kilograms.
 *
 * Nothing moves when the ingredient was unpriced before: its first price is the
 * cost being established, and the menu already reflects it.
 */
export async function repriceForIngredient(
  tx: Tx,
  args: {
    restaurantId: string;
    itemId: string;
    before: PricedIngredient;
    after: PricedIngredient;
    step: number;
  },
): Promise<RepricedProduct[]> {
  const lines = await tx.productIngredient.findMany({
    where: { itemId: args.itemId, product: { restaurantId: args.restaurantId } },
    select: { perUnitMilli: true, product: { select: PRICE_SELECT } },
  });

  const repriced: RepricedProduct[] = [];

  for (const { perUnitMilli, product } of lines) {
    const delta = passThroughDelta(perUnitMilli, args.before, args.after);
    if (delta === 0) continue;

    const priceExact = applyCostDelta(product.priceExact, delta);
    const compareExact = product.compareAtPriceExact ?? product.compareAtPrice;
    // The "was" price moves by the same amount, so the saving a guest is
    // shown stays the same size in Toman.
    const compareAtPriceExact =
      compareExact === null ? null : applyCostDelta(compareExact, delta);

    const shown = shownPrices({ priceExact, compareAtPriceExact, step: args.step });

    await tx.product.update({
      where: { id: product.id },
      data: {
        priceExact,
        compareAtPriceExact,
        price: shown.price,
        compareAtPrice: shown.compareAtPrice,
      },
    });

    repriced.push({
      id: product.id,
      name: product.name,
      priceBefore: product.price,
      priceAfter: shown.price,
      priceExactBefore: product.priceExact,
      priceExactAfter: priceExact,
      delta,
    });
  }

  return repriced;
}

// ---------------------------------------------------------------- step

/**
 * Re-derives every shown price from its exact price at a new step.
 *
 * Only shown prices change. The exact prices are untouched — that is the
 * point of keeping them — so a venue that tries 5,000 and goes back to 1,000
 * lands exactly where it started.
 */
export async function applyMenuPriceStep(
  tx: Tx,
  restaurantId: string,
  step: number,
): Promise<number> {
  const products = await tx.product.findMany({
    where: { restaurantId },
    select: PRICE_SELECT,
  });

  let changed = 0;
  for (const product of products) {
    const shown = shownPrices({
      priceExact: product.priceExact,
      compareAtPriceExact: product.compareAtPriceExact ?? product.compareAtPrice,
      step,
    });

    if (
      shown.price !== product.price ||
      shown.compareAtPrice !== product.compareAtPrice
    ) {
      await tx.product.update({
        where: { id: product.id },
        data: { price: shown.price, compareAtPrice: shown.compareAtPrice },
      });
      changed += 1;
    }
  }

  return changed;
}

// -------------------------------------------------------------- warnings

export interface PriceAlert {
  id: string;
  name: string;
  price: number;
  cost: number;
  warning: PriceWarning;
  marginPercent: number | null;
}

/**
 * Which of these dishes are now priced below their ingredients, or too thin.
 *
 * Read after an ingredient change so the owner is told the consequence where
 * they made it — most sharply when automatic repricing is off, where a price
 * rise lands entirely on the margin.
 */
export async function priceAlerts(
  tx: Tx,
  restaurantId: string,
  productIds: readonly string[],
  lowMarginPercent: number,
): Promise<PriceAlert[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];

  const products = await tx.product.findMany({
    where: { id: { in: ids }, restaurantId },
    select: { id: true, name: true, price: true, costPrice: true },
    orderBy: { name: "asc" },
  });

  const alerts: PriceAlert[] = [];
  for (const product of products) {
    const health = priceHealth({
      price: product.price,
      cost: product.costPrice,
      lowMarginPercent,
    });
    if (health.warning) {
      alerts.push({
        id: product.id,
        name: product.name,
        price: product.price,
        cost: product.costPrice,
        warning: health.warning,
        marginPercent: health.marginPercent,
      });
    }
  }
  return alerts;
}

/** The dishes whose recipe uses this ingredient. */
export async function productsUsing(
  tx: Tx,
  restaurantId: string,
  itemId: string,
): Promise<string[]> {
  const lines = await tx.productIngredient.findMany({
    where: { itemId, product: { restaurantId } },
    select: { productId: true },
  });
  return lines.map((line) => line.productId);
}
