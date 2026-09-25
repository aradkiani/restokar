"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useAddToCart, useMenu } from "./runtime";
import { PriceTag, ProductImage } from "./pieces";
import { reportRecommendationEvent } from "./recommendation-events";
import { reportFeaturedEvent } from "./featured-events";
import { formatMoney } from "@/lib/format";
import type { ResolvedUpsell } from "./use-upsells";

/**
 * One suggested dish, rendered identically wherever it appears.
 *
 * The cart strip and the product sheet had their own copies of this row, which
 * is how they came to disagree about whether a photo shows and about what a
 * tap reports. One component, two callers.
 *
 * Presentation only — nothing here decides *whether* to suggest anything. The
 * surrounding section already has its list from `useUpsells`, which is the one
 * place that rule lives.
 */
export function SuggestionRow({
  pick,
  onAdd,
}: {
  pick: ResolvedUpsell;
  onAdd: (pick: ResolvedUpsell) => void;
}) {
  const { data, locale, t, preview } = useMenu();
  const product = pick.product;

  return (
    <li
      className="flex items-center gap-2.5 rounded-[var(--m-radius-sm)] p-2"
      style={{ background: "var(--m-surface)" }}
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
        {/* Wraps to two lines rather than pushing the price and the button off
            a 320px screen. */}
        <p className="line-clamp-2 text-sm leading-5 font-bold">{product.name}</p>

        {/*
          Why this dish is here.

          Deliberately quiet — 11px at 65% opacity, one line, no pill and no
          colour. It is a footnote that answers a question the guest may have,
          not a badge competing with the dish for attention.
        */}
        <p className="mt-0.5 text-[0.6875rem] leading-4" style={{ opacity: 0.65 }}>
          {t.publicMenu.upsellReasons[pick.reason]}
          {pick.saving !== null && (
            <>
              {" · "}
              <span style={{ fontWeight: 700 }}>
                {t.publicMenu.bundleSaving.replace(
                  "{amount}",
                  formatMoney(pick.saving, locale),
                )}
              </span>
            </>
          )}
        </p>

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

        Making the whole card tappable would hand a screen reader one unlabelled
        target wrapping an image, a name and a price, and would stop the price
        being selectable. This is one named action, which is what the product
        cards already do.

        Rendered only where the guest could actually order — a preview, or a
        venue with ordering switched off, gets the list without a control that
        would do nothing.
      */}
      {data.restaurant.onlineOrderingEnabled && !preview && (
        <button
          type="button"
          onClick={() => onAdd(pick)}
          aria-label={`${t.publicMenu.addToCart} — ${product.name}`}
          className="tap-safe grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95"
          style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
        >
          <Plus className="size-4.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

/**
 * Reports a tap and hands the dish to the ordinary add-to-cart path.
 *
 * Shared so the two surfaces cannot report differently. Two events, because
 * they are two different things: a dish with a required choice opens its sheet
 * on tap and may never reach the basket at all, so INTERACTION always fires and
 * ADD_TO_CART only when the dish can go straight in.
 *
 * A `featured` suggestion has no source dish, so it reports through the
 * featured event table instead — the two tables exist precisely because one
 * keys on a source and the other cannot. See the schema comment on
 * `FeaturedProductEvent`.
 */
export function useSuggestionAdd(): (pick: ResolvedUpsell) => void {
  const { data, preview } = useMenu();
  const addToCart = useAddToCart();

  return React.useCallback(
    (pick: ResolvedUpsell) => {
      const product = pick.product;
      const goesStraightIn = !product.optionGroups.some((group) => group.isRequired);
      const slug = data.restaurant.slug;

      if (pick.sourceProductId) {
        reportRecommendationEvent({
          slug,
          sourceProductId: pick.sourceProductId,
          recommendedProductId: product.id,
          type: "INTERACTION",
          preview,
        });

        if (goesStraightIn) {
          reportRecommendationEvent({
            slug,
            sourceProductId: pick.sourceProductId,
            recommendedProductId: product.id,
            type: "ADD_TO_CART",
            preview,
          });
        }
      } else {
        reportFeaturedEvent({ slug, productId: product.id, type: "VIEW", preview });
        if (goesStraightIn) {
          reportFeaturedEvent({
            slug,
            productId: product.id,
            type: "ADD_TO_CART",
            preview,
          });
        }
      }

      /*
        The same add path every product card uses.

        It opens the sheet when the dish needs a choice and adds it directly
        when it does not, so a suggested pizza asks for its size through exactly
        the option system and pricing the menu already uses. Nothing about
        options or price is reimplemented here — carrying the attribution is the
        only thing this call does differently.
      */
      addToCart(product, pick.sourceProductId, pick.sourceProductId === null);
    },
    [data.restaurant.slug, preview, addToCart],
  );
}

/**
 * One impression per suggestion while the panel is on screen.
 *
 * Routed to whichever table can hold it, for the same reason the tap is.
 * Repeats are collapsed by the session key and the unique index, so this
 * over-counts attention rather than guests — the honest limitation both
 * surfaces already documented.
 */
export function useSuggestionImpressions(
  picks: readonly ResolvedUpsell[],
  active = true,
) {
  const { data, preview } = useMenu();
  const slug = data.restaurant.slug;

  React.useEffect(() => {
    if (!active) return;

    for (const pick of picks) {
      if (pick.sourceProductId) {
        reportRecommendationEvent({
          slug,
          sourceProductId: pick.sourceProductId,
          recommendedProductId: pick.product.id,
          type: "IMPRESSION",
          preview,
        });
      } else {
        reportFeaturedEvent({
          slug,
          productId: pick.product.id,
          type: "IMPRESSION",
          preview,
        });
      }
    }
  }, [picks, slug, preview, active]);
}
