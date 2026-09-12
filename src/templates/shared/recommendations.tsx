"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useAddToCart, useMenu } from "./runtime";
import { useCart } from "./cart";
import { PriceTag, ProductImage } from "./pieces";
import { reportRecommendationEvent } from "./recommendation-events";
import { selectRecommendations } from "@/lib/recommendations";
import type { MenuProduct } from "../types";

/**
 * "Complete your order" — the owner's suggestions for what is already in the
 * basket.
 *
 * Placed inside the cart sheet rather than given a step of its own. A guest
 * opens the cart when they are deciding whether they are finished, which is the
 * one moment another suggestion is useful rather than an interruption — and it
 * costs no extra modal, no new screen and no change to the ordering flow.
 * Ignoring it is the only thing required to decline: nothing blocks checkout,
 * and there is no dismissal to perform.
 *
 * Every dish shown is resolved out of the menu the page already holds, so a
 * suggestion cannot disagree with the menu about name, price or availability —
 * there is only one copy of each.
 */
export function RecommendationStrip() {
  const { data, locale, t, preview } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();

  /**
   * Every dish on the menu, by id.
   *
   * Note this reads `data` as the template receives it, which `localizeMenuData`
   * has already resolved to the current language — so names here are in the
   * language the guest is reading without this component knowing the rule.
   */
  const productsById = React.useMemo(() => {
    const map = new Map<string, MenuProduct>();
    for (const category of data.categories) {
      for (const product of category.products) map.set(product.id, product);
    }
    return map;
  }, [data]);

  /** The edges the menu shipped, flattened once and already in owner order. */
  const edges = React.useMemo(
    () =>
      [...productsById.values()].flatMap((product) =>
        product.recommendedProductIds.map((recommendedProductId) => ({
          sourceProductId: product.id,
          recommendedProductId,
        })),
      ),
    [productsById],
  );

  const picks = React.useMemo(() => {
    if (edges.length === 0) return [];

    /*
      Only dishes that can actually be ordered right now.

      `isAvailable` is the *effective* answer the server already computed from
      the manual switch, the dish's own opening hours and its category's.
      Re-deriving any of that here would be a second implementation of a
      decision that has to have exactly one.
    */
    const orderable = new Set(
      [...productsById.values()].filter((p) => p.isAvailable).map((p) => p.id),
    );

    return selectRecommendations(
      edges,
      cart.lines.map((line) => line.productId),
      orderable,
    );
  }, [edges, productsById, cart.lines]);

  /*
    An impression is recorded while the panel is on screen with something in it.

    The cart sheet is opened deliberately by the guest and this sits directly
    above the checkout button, so "rendered" is a fair proxy for "seen" in a way
    it would not be for something below the fold. The honest limitation is that
    a guest who opens the cart and immediately closes it still counts. Repeats
    do not: the send is keyed per session and the unique index refuses
    duplicates, so this over-counts attention rather than guests.
  */
  React.useEffect(() => {
    if (!cart.isOpen) return;
    for (const pick of picks) {
      reportRecommendationEvent({
        slug: data.restaurant.slug,
        sourceProductId: pick.sourceProductId,
        recommendedProductId: pick.recommendedProductId,
        type: "IMPRESSION",
        preview,
      });
    }
  }, [cart.isOpen, picks, data.restaurant.slug, preview]);

  if (picks.length === 0) return null;

  function handleAdd(pick: { sourceProductId: string; recommendedProductId: string }) {
    const product = productsById.get(pick.recommendedProductId);
    if (!product) return;

    // Two events, because they are two different things: a dish with a required
    // choice opens its sheet on tap and may never reach the basket at all.
    reportRecommendationEvent({
      slug: data.restaurant.slug,
      sourceProductId: pick.sourceProductId,
      recommendedProductId: pick.recommendedProductId,
      type: "INTERACTION",
      preview,
    });

    if (!product.optionGroups.some((group) => group.isRequired)) {
      reportRecommendationEvent({
        slug: data.restaurant.slug,
        sourceProductId: pick.sourceProductId,
        recommendedProductId: pick.recommendedProductId,
        type: "ADD_TO_CART",
        preview,
      });
    }

    /*
      The same add path every product card uses.

      It opens the sheet when the dish needs a choice and adds it directly when
      it does not, so a suggested pizza asks for its size through exactly the
      option system and pricing the menu already uses. Nothing about options or
      price is reimplemented here — passing the source id along is the only
      thing this call does differently.
    */
    addToCart(product, pick.sourceProductId);
  }

  return (
    <section
      aria-labelledby="menuland-recommendations"
      className="border-t px-4 py-3"
      style={{ borderColor: "var(--m-border)" }}
    >
      <h3
        id="menuland-recommendations"
        className="mb-2 text-xs font-bold"
        style={{ color: "var(--m-text)", opacity: 0.7 }}
      >
        {t.publicMenu.recommendationsTitle}
      </h3>

      <ul className="space-y-2">
        {picks.map((pick) => {
          const product = productsById.get(pick.recommendedProductId);
          if (!product) return null;

          return (
            <li
              key={pick.recommendedProductId}
              className="flex items-center gap-2.5 p-2"
              style={{
                background: "var(--m-surface-bg, transparent)",
                borderRadius: "var(--m-radius-sm)",
              }}
            >
              {data.restaurant.showProductPhotos && (
                <div className="size-12 shrink-0 overflow-hidden">
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.name}
                    seed={product.id}
                    rounded="var(--m-radius-sm)"
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                {/* Wraps to two lines rather than pushing the price and the
                    button off a 320px screen. */}
                <p className="line-clamp-2 text-sm leading-5 font-bold">{product.name}</p>
                <PriceTag
                  price={product.price}
                  compareAt={product.compareAtPrice}
                  show={data.restaurant.showPrices}
                  locale={locale}
                  className="mt-0.5 text-xs"
                />
              </div>

              {/*
                A button, not a clickable row.

                Making the whole card tappable would hand a screen reader one
                unlabelled target wrapping an image, a name and a price, and
                would stop the price being selectable. This is one named action,
                which is also what the product cards already do.
              */}
              <button
                type="button"
                onClick={() => handleAdd(pick)}
                aria-label={`${t.publicMenu.addToCart} — ${product.name}`}
                className="tap-safe grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95"
                style={{
                  background: "var(--m-primary)",
                  color: "var(--m-primary-contrast)",
                }}
              >
                <Plus className="size-4.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
