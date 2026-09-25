"use client";

import * as React from "react";
import { useMenu } from "./runtime";
import { useCart } from "./cart";
import { resolveBundle } from "@/lib/bundles";
import {
  bundlesFor,
  selectUpsells,
  type BundleOffer,
  type UpsellReason,
} from "@/lib/upsell";
import type { MenuProduct } from "../types";

/**
 * The one place a merchandising surface asks "what should I offer?".
 *
 * Both guest surfaces used to answer that themselves. The cart strip walked the
 * owner's edges through `selectRecommendations`; the product sheet filtered the
 * same edges inline, **uncapped and without excluding what was already in the
 * basket**. The two drifted because there were two of them, so there is now
 * one, and every rule lives behind `selectUpsells` in the pure engine.
 *
 * This hook does no deciding of its own. It gathers what the engine needs out
 * of the menu the page already holds, calls it, and resolves the resulting ids
 * back to products. Nothing here re-derives availability, price or a reason.
 */

/** A suggestion with its dish already resolved, ready to render. */
export interface ResolvedUpsell {
  product: MenuProduct;
  sourceProductId: string | null;
  reason: UpsellReason;
  /** Whole Toman saved, on a `bundle` suggestion that saves something. */
  saving: number | null;
}

/**
 * Every dish on the menu, by id.
 *
 * Reads `data` as the template receives it, which `localizeMenuData` has
 * already resolved to the guest's language — so names are in the right language
 * without this file knowing the rule exists.
 */
function useProductsById(): Map<string, MenuProduct> {
  const { data } = useMenu();

  return React.useMemo(() => {
    const map = new Map<string, MenuProduct>();
    for (const category of data.categories) {
      for (const product of category.products) map.set(product.id, product);
    }
    return map;
  }, [data]);
}

/**
 * The dishes that can actually be ordered right now.
 *
 * `isAvailable` is the *effective* answer the server already computed from the
 * manual switch, the dish's own opening hours and its category's. Re-deriving
 * any of it here would be a second implementation of a decision that must have
 * exactly one — and the server re-checks it at order time regardless, so a
 * stale browser cannot turn a suggestion into a purchase.
 */
function useOrderableIds(productsById: Map<string, MenuProduct>): Set<string> {
  return React.useMemo(
    () =>
      new Set([...productsById.values()].filter((p) => p.isAvailable).map((p) => p.id)),
    [productsById],
  );
}

/**
 * The venue's meal deals, priced against the live menu.
 *
 * A bundle is an ordinary product carrying components, so finding them is a
 * scan for products with a non-empty `bundleComponents`. The saving is computed
 * from the same product rows the page is rendering, which is what makes it
 * impossible for a quoted saving to disagree with the prices beside it.
 */
function useBundleOffers(
  productsById: Map<string, MenuProduct>,
  orderableIds: ReadonlySet<string>,
): BundleOffer[] {
  return React.useMemo(() => {
    const priceOf = (id: string) => productsById.get(id)?.price ?? null;

    return (
      [...productsById.values()]
        .filter((product) => product.bundleComponents.length > 0)
        .map((product) => {
          const resolved = resolveBundle({
            price: product.price,
            isAvailable: product.isAvailable,
            components: product.bundleComponents,
            priceOf,
            orderableProductIds: orderableIds,
          });

          return {
            productId: product.id,
            componentProductIds: resolved.components.map((c) => c.productId),
            saving: resolved.saving,
            isOrderable: resolved.isOrderable,
          };
        })
        /*
        A deal whose chips are sold out is not a deal.

        Dropped here rather than passed on with a flag, because every consumer
        of `BundleOffer` wants the same answer and `selectUpsells` filters on
        `orderableProductIds` — which reflects the *bundle product's own*
        availability, not its components'. This is where those two facts meet.
      */
        .filter((offer) => offer.isOrderable)
    );
  }, [productsById, orderableIds]);
}

/**
 * What to offer, given the dishes prompting it.
 *
 * `sources` is the whole basket in the cart and the single dish on a product
 * sheet — the same question asked at two moments, which is why it is one hook.
 *
 * `exclude` is for dishes already on screen from another block, so the product
 * sheet's meal-deal panel and its suggestion list cannot offer the same combo
 * twice.
 */
export function useUpsells(
  sources: readonly string[],
  limit?: number,
  exclude?: readonly string[],
): ResolvedUpsell[] {
  const productsById = useProductsById();
  const orderableIds = useOrderableIds(productsById);
  const bundles = useBundleOffers(productsById, orderableIds);
  const cart = useCart();

  const basketProductIds = React.useMemo(
    () => cart.lines.map((line) => line.productId),
    [cart.lines],
  );

  /** The edges the menu shipped, flattened once and already in owner order. */
  const pairings = React.useMemo(
    () =>
      [...productsById.values()].flatMap((product) =>
        product.recommendedProductIds.map((recommendedProductId) => ({
          sourceProductId: product.id,
          recommendedProductId,
        })),
      ),
    [productsById],
  );

  /** The stored co-occurrence counts, flattened. Thresholds are the engine's. */
  const coOccurrence = React.useMemo(
    () => [...productsById.values()].flatMap((product) => product.frequentlyWith),
    [productsById],
  );

  const featured = React.useMemo(
    () =>
      [...productsById.values()]
        .filter((product) => product.isFeatured)
        .map((product) => ({
          productId: product.id,
          featuredOrder: product.featuredOrder,
        })),
    [productsById],
  );

  const savingByBundleId = React.useMemo(
    () => new Map(bundles.map((bundle) => [bundle.productId, bundle.saving])),
    [bundles],
  );

  return React.useMemo(() => {
    const picks = selectUpsells({
      sourceProductIds: sources,
      basketProductIds,
      orderableProductIds: orderableIds,
      excludeProductIds: exclude,
      pairings,
      bundles,
      coOccurrence,
      featured,
      limit,
    });

    return picks.flatMap((pick) => {
      const product = productsById.get(pick.productId);
      if (!product) return [];

      return [
        {
          product,
          sourceProductId: pick.sourceProductId,
          reason: pick.reason,
          saving:
            pick.reason === "bundle"
              ? (savingByBundleId.get(pick.productId) ?? null)
              : null,
        },
      ];
    });
  }, [
    sources,
    basketProductIds,
    orderableIds,
    exclude,
    pairings,
    bundles,
    coOccurrence,
    featured,
    limit,
    productsById,
    savingByBundleId,
  ]);
}

/** One meal deal, with its contents resolved to products for display. */
export interface ResolvedBundleOffer {
  product: MenuProduct;
  components: { product: MenuProduct; quantity: number }[];
  saving: number | null;
}

/**
 * The meal deals containing a given dish.
 *
 * Separate from `useUpsells` because "this dish is part of a combo" is worth
 * saying next to the dish whether or not the deal wins a slot in the ranked
 * panel — and because the sheet shows what is *in* the deal, which the ranked
 * panel has no room for.
 */
export function useBundlesContaining(productId: string): ResolvedBundleOffer[] {
  const productsById = useProductsById();
  const orderableIds = useOrderableIds(productsById);
  const bundles = useBundleOffers(productsById, orderableIds);
  const cart = useCart();

  const basketProductIds = React.useMemo(
    () => cart.lines.map((line) => line.productId),
    [cart.lines],
  );

  return React.useMemo(() => {
    const offers = bundlesFor([productId], basketProductIds, bundles, orderableIds);

    return offers.flatMap((offer) => {
      const product = productsById.get(offer.productId);
      if (!product) return [];

      const components = product.bundleComponents.flatMap((component) => {
        const componentProduct = productsById.get(component.productId);
        return componentProduct
          ? [{ product: componentProduct, quantity: component.quantity }]
          : [];
      });

      return [{ product, components, saving: offer.saving }];
    });
  }, [productId, basketProductIds, bundles, orderableIds, productsById]);
}

/** The dish a bundle is built around, for attribution. Null when unknown. */
export function bundleSourceFor(
  offer: ResolvedBundleOffer,
  sources: readonly string[],
): string | null {
  return (
    offer.components.map((c) => c.product.id).find((id) => sources.includes(id)) ?? null
  );
}
