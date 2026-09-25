"use client";

import * as React from "react";
import { useMenu, useAddToCart } from "./runtime";
import { PriceTag, ProductImage } from "./pieces";
import { reportFeaturedEvent } from "./featured-events";
import { MAX_FEATURED_SHOWN, resolveFeaturedLabel, sortFeatured } from "@/lib/featured";
import type { MenuProduct } from "../types";

/**
 * Merchandising on the public menu: the badge, and the strip.
 *
 * Both read `product.isFeatured`, which the server has already resolved to the
 * *effective* answer — promoted only while the window is open and the dish is
 * genuinely orderable. Nothing here re-derives that, so there is no way for the
 * menu to advertise something a guest cannot buy.
 */

/**
 * The label on a promoted dish, or nothing.
 *
 * Built-in badges arrive as keys and are translated here, where the dictionary
 * is already in hand; a venue's own wording is printed as written. Deliberately
 * small and quiet — a badge that shouts is a badge an owner stops using because
 * it makes their menu look like a supermarket.
 */
export function FeaturedBadge({ product }: { product: MenuProduct }) {
  const { t } = useMenu();

  if (!product.isFeatured) return null;

  const label = resolveFeaturedLabel(product);
  if (!label) return null;

  const text = label.kind === "key" ? t.featuredLabels[label.value] : label.value;

  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold"
      style={{
        background: "var(--m-secondary)",
        color: "var(--m-secondary-contrast)",
      }}
    >
      {text}
    </span>
  );
}

/**
 * A horizontal strip of the dishes a venue is pushing.
 *
 * Rendered only when the owner switched the strip on, which is why no existing
 * menu changed the day this shipped. Horizontal rather than a grid because it
 * has to sit above the menu on a phone without pushing the actual menu off the
 * first screen — merchandising that buries the thing being merchandised is
 * worse than none.
 *
 * No countdowns, no "only 2 left", no urgency of any kind: the system has no
 * inventory data that could make such a claim true, and inventing one would be
 * a lie told on a restaurant's behalf.
 */
export function FeaturedStrip() {
  const { data, locale, t, preview } = useMenu();
  const addToCart = useAddToCart();
  const { openProduct } = useMenu();

  const featured = React.useMemo(() => {
    if (!data.restaurant.featuredSectionEnabled) return [];

    /*
      `isFeatured` is the effective answer the server already resolved, so no
      availability or window logic is repeated here.

      Sorted by `featuredOrder` at this point rather than in the query, because
      the products arrive grouped by category and ordering them there would move
      a promoted dish within its category on the normal menu.
    */
    return sortFeatured(
      data.categories
        .flatMap((category) => category.products)
        .filter((product) => product.isFeatured),
    ).slice(0, MAX_FEATURED_SHOWN);
  }, [data]);

  /*
    One impression per dish per guest session.

    The strip sits at the top of the menu, so it is on screen as soon as the
    page is. The honest limitation is the same as the suggestion panel's: this
    counts the strip being rendered where it could be seen, not a guest's eyes
    reaching it. Repeats cost nothing — the send is keyed per session and the
    unique index refuses duplicates.
  */
  React.useEffect(() => {
    for (const product of featured) {
      reportFeaturedEvent({
        slug: data.restaurant.slug,
        productId: product.id,
        type: "IMPRESSION",
        preview,
      });
    }
  }, [featured, data.restaurant.slug, preview]);

  if (featured.length === 0) return null;

  function open(product: MenuProduct) {
    reportFeaturedEvent({
      slug: data.restaurant.slug,
      productId: product.id,
      type: "VIEW",
      preview,
    });
    // The ordinary detail sheet, with its ordinary options and pricing.
    openProduct(product);
  }

  function add(product: MenuProduct) {
    reportFeaturedEvent({
      slug: data.restaurant.slug,
      productId: product.id,
      type: "ADD_TO_CART",
      preview,
    });
    /*
      The same add path every product card uses: it opens the sheet when the
      dish needs a required choice and adds it directly when it does not. No
      second ordering path, no second price calculation.
    */
    addToCart(product, null, true);
  }

  return (
    /*
      Rendered as the first thing inside each template's `<main>`, and bleeding
      back out of its horizontal padding with `-mx-4 … px-4`.

      That negative margin is the same trick the category chips already use: a
      horizontally scrolling row has to run edge to edge on a phone, or the last
      card looks clipped rather than scrollable, while its contents still need
      to line up with the menu below it.
    */
    <section aria-labelledby="restokar-featured" className="-mx-4 mb-5">
      <h2
        id="restokar-featured"
        className="mb-2.5 px-4 text-sm font-black"
        style={{ color: "var(--m-text)" }}
      >
        {t.publicMenu.featuredTitle}
      </h2>

      <ul className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
        {featured.map((product) => (
          <li key={product.id} className="w-40 shrink-0">
            <div
              className="overflow-hidden"
              style={{
                background: "var(--m-surface)",
                borderRadius: "var(--m-radius)",
              }}
            >
              {/*
                The card opens the dish; a separate button adds it. Two named
                actions rather than one ambiguous tappable card, which is what
                the product cards elsewhere already do.
              */}
              <button
                type="button"
                onClick={() => open(product)}
                className="block w-full text-start"
                aria-label={product.name}
              >
                {data.restaurant.showProductPhotos && (
                  <div className="aspect-[4/3] w-full overflow-hidden">
                    <ProductImage
                      src={product.imageUrl}
                      alt={product.name}
                      seed={product.id}
                      rounded="0"
                    />
                  </div>
                )}

                <div className="p-2.5">
                  <FeaturedBadge product={product} />
                  <p className="mt-1 line-clamp-2 text-xs leading-5 font-bold">
                    {product.name}
                  </p>
                  <PriceTag
                    price={product.price}
                    compareAt={product.compareAtPrice}
                    show={data.restaurant.showPrices}
                    locale={locale}
                    className="mt-1 text-xs"
                  />
                </div>
              </button>

              {data.restaurant.onlineOrderingEnabled && !preview && (
                <div className="px-2.5 pb-2.5">
                  <button
                    type="button"
                    onClick={() => add(product)}
                    aria-label={`${t.publicMenu.addToCart} — ${product.name}`}
                    className="tap-safe h-9 w-full rounded-full text-xs font-bold transition-transform active:scale-95"
                    style={{
                      background: "var(--m-primary)",
                      color: "var(--m-primary-contrast)",
                    }}
                  >
                    {t.publicMenu.addToCart}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
