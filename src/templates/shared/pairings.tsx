"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useAddToCart, useMenu } from "./runtime";
import { PriceTag, ProductImage } from "./pieces";
import { reportRecommendationEvent } from "./recommendation-events";
import type { MenuProduct } from "../types";

/**
 * "These go well with it" — the owner's pairings for the dish the guest is
 * actually looking at.
 *
 * The sibling of `RecommendationStrip`, and deliberately not a second system:
 * both read the same `recommendedProductIds` edges the menu already ships, both
 * resolve those ids against the products on the page, and both report through
 * `reportRecommendationEvent` so one merchandising report covers the two
 * surfaces. What differs is the moment. The strip asks "anything else?" in the
 * cart, when a guest is deciding whether they are finished; this answers "what
 * goes with this?" while they are still looking at the dish — which is when a
 * pairing is a suggestion rather than an upsell.
 *
 * The heading is the owner's own sentence when they have written one. A café
 * can say «کمی خنکتان می‌کند» over an iced drink where a burger says «با اینها
 * عالی می‌شود»; a venue that writes nothing gets the platform's generic line
 * rather than a blank heading.
 */
export function PairingSuggestions({ product }: { product: MenuProduct }) {
  const { data, locale, t, preview } = useMenu();
  const addToCart = useAddToCart();

  /** Every dish on the page, already resolved to the guest's language. */
  const productsById = React.useMemo(() => {
    const map = new Map<string, MenuProduct>();
    for (const category of data.categories) {
      for (const item of category.products) map.set(item.id, item);
    }
    return map;
  }, [data]);

  /*
    Only pairings that can actually be ordered right now.

    `isAvailable` is the *effective* answer the server already computed from the
    manual switch, the dish's own hours and its category's — re-deriving any of
    it here would be a second copy of a decision that must have exactly one.
    A dish that has since been removed from the menu simply is not in the map.
  */
  const pairings = React.useMemo(
    () =>
      product.recommendedProductIds
        .map((id) => productsById.get(id))
        .filter((item): item is MenuProduct => Boolean(item?.isAvailable)),
    [product.recommendedProductIds, productsById],
  );

  /*
    One impression per pairing while the sheet is open.

    The guest opened this sheet deliberately and the block sits in the flow of
    it, so "rendered" is a fair proxy for "seen". Repeats are collapsed by the
    session key and the unique index, so this over-counts attention rather than
    guests — the same honest limitation the cart strip documents.
  */
  React.useEffect(() => {
    for (const pairing of pairings) {
      reportRecommendationEvent({
        slug: data.restaurant.slug,
        sourceProductId: product.id,
        recommendedProductId: pairing.id,
        type: "IMPRESSION",
        preview,
      });
    }
  }, [pairings, product.id, data.restaurant.slug, preview]);

  if (pairings.length === 0) return null;

  function handleAdd(pairing: MenuProduct) {
    // Two events, because they are two different things: a dish with a required
    // choice opens its own sheet on tap and may never reach the basket at all.
    reportRecommendationEvent({
      slug: data.restaurant.slug,
      sourceProductId: product.id,
      recommendedProductId: pairing.id,
      type: "INTERACTION",
      preview,
    });

    if (!pairing.optionGroups.some((group) => group.isRequired)) {
      reportRecommendationEvent({
        slug: data.restaurant.slug,
        sourceProductId: product.id,
        recommendedProductId: pairing.id,
        type: "ADD_TO_CART",
        preview,
      });
    }

    // The same add path every product card uses, so a paired pizza asks for its
    // size through exactly the option system and pricing the menu already has.
    addToCart(pairing, product.id);
  }

  return (
    <section
      aria-labelledby={`menuland-pairings-${product.id}`}
      className="mt-6 rounded-[var(--m-radius-sm)] p-4"
      style={{ background: "var(--m-primary-soft)" }}
    >
      <h3
        id={`menuland-pairings-${product.id}`}
        className="text-sm font-bold"
        style={{ color: "var(--m-primary)" }}
      >
        {product.pairingNote?.trim() || t.publicMenu.pairingsFallback}
      </h3>

      <ul className="mt-3 space-y-2">
        {pairings.map((pairing) => (
          <li
            key={pairing.id}
            className="flex items-center gap-2.5 rounded-[var(--m-radius-sm)] p-2"
            style={{ background: "var(--m-surface)" }}
          >
            {data.restaurant.showProductPhotos && (
              <div className="size-12 shrink-0 overflow-hidden">
                <ProductImage
                  src={pairing.imageUrl}
                  alt={pairing.name}
                  seed={pairing.id}
                  rounded="var(--m-radius-sm)"
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              {/* Wraps rather than pushing the price and button off a 320px
                  screen, the same rule the cart strip follows. */}
              <p className="line-clamp-2 text-sm leading-5 font-bold">{pairing.name}</p>
              <PriceTag
                price={pairing.price}
                compareAt={pairing.compareAtPrice}
                show={data.restaurant.showPrices}
                locale={locale}
                className="mt-0.5 text-xs"
              />
            </div>

            {/* Rendered only when the guest could actually order it — a preview
                or a venue with ordering switched off gets the list without a
                control that would do nothing. */}
            {data.restaurant.onlineOrderingEnabled && !preview && (
              <button
                type="button"
                onClick={() => handleAdd(pairing)}
                aria-label={`${t.publicMenu.addToCart} — ${pairing.name}`}
                className="tap-safe grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95"
                style={{
                  background: "var(--m-primary)",
                  color: "var(--m-primary-contrast)",
                }}
              >
                <Plus className="size-4.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
