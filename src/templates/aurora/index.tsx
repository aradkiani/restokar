"use client";

import * as React from "react";
import type { TemplateProps } from "../types";
import { useAddToCart, useMenu } from "../shared/runtime";
import { useCart } from "../shared/cart";
import {
  CartBar,
  CartButton,
  CategoryChips,
  LanguageToggle,
  MenuEmpty,
  SearchField,
  useActiveCategory,
  useMenuSearch,
} from "../shared/chrome";
import {
  AddToCartButton,
  PriceTag,
  ProductImage,
  UnavailableOverlay,
} from "../shared/pieces";
import { FeaturedStrip } from "../shared/featured";
import { MenuFooter } from "../shared/footer";
import { CategoryIcon } from "@/components/icon";

/**
 * Aurora — bright, glassy and airy. A sticky frosted header, pill category
 * navigation and a two-column card grid. The default template.
 */
export default function AuroraTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, filtered, isSearching } = useMenuSearch(data.categories);
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-3xl pb-28">
      {/* ---------------------------------------------------------------- hero */}
      <header className="relative">
        {restaurant.coverUrl && (
          <div className="absolute inset-x-0 top-0 h-52 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restaurant.coverUrl} alt="" className="size-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to bottom, transparent, var(--m-bg))",
              }}
            />
          </div>
        )}

        <div className="relative px-4 pt-8 pb-5 text-center">
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="mx-auto size-24 rounded-full object-cover shadow-[var(--m-surface-shadow)] ring-4"
              style={{
                borderColor: "var(--m-surface)",
                ["--tw-ring-color" as string]: "var(--m-surface)",
              }}
            />
          ) : (
            <div
              className="mx-auto grid size-24 place-items-center rounded-full text-3xl font-black shadow-[var(--m-surface-shadow)]"
              style={{
                background: "var(--m-primary)",
                color: "var(--m-primary-contrast)",
              }}
            >
              {restaurant.name.trim().charAt(0)}
            </div>
          )}

          <h1 className="mt-4 text-2xl font-black tracking-tight">{restaurant.name}</h1>
          {restaurant.tagline && (
            <p className="mt-1.5 text-sm opacity-70">{restaurant.tagline}</p>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------ sticky nav bar */}
      {/* The whole menu scrolls under this bar, so it uses the strong surface
          rather than the card one — at card opacity the dish names behind it
          were legible through the search field. */}
      <div
        className="menu-surface sticky top-0 z-30 -mx-0 !rounded-none border-x-0 border-t-0 px-3 py-2"
        style={{ background: "var(--m-surface-strong)" }}
      >
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} className="flex-1" />
          <LanguageToggle
            style={{ background: "var(--m-primary-soft)", color: "var(--m-primary)" }}
          />
          <CartButton
            style={{ background: "var(--m-primary-soft)", color: "var(--m-primary)" }}
          />
        </div>

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            className="-mx-3 mt-2 px-3"
          />
        )}
      </div>

      {/* -------------------------------------------------------------- content */}
      {/* Top padding is deliberately small across all four templates: the
          sticky bar already separates the nav from the list, so extra space
          here only pushes the first dish below the fold. */}
      <main id="main" className="px-4 pt-4">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              // Clears the sticky search + chip bar. Measured at 114px on a
              // 375px viewport, so scroll-mt-28 (112px) landed the heading
              // *under* the bar when a category chip was tapped.
              className="mb-10 scroll-mt-36"
            >
              <div className="mb-4 flex items-center gap-2.5">
                <span
                  className="grid size-9 place-items-center rounded-full"
                  style={{
                    background: "var(--m-primary-soft)",
                    color: "var(--m-primary)",
                  }}
                >
                  <CategoryIcon
                    name={category.icon}
                    url={category.iconUrl}
                    className="size-4.5"
                  />
                </span>
                <h2 className="text-lg font-black">{category.name}</h2>
                <span
                  className="h-px flex-1"
                  style={{ background: "var(--m-border)" }}
                  aria-hidden
                />
              </div>

              {/* auto-fill rather than fixed column counts: the grid adapts to
                  any width between a 320px phone and a desktop preview pane
                  without a breakpoint for each step. */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:gap-4">
                {category.products.map((product) => {
                  const inCart = cart.quantityOf(product.id);
                  return (
                    <article
                      key={product.id}
                      className="menu-surface group relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => openProduct(product)}
                        className="block w-full text-start"
                        aria-label={product.name}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden">
                          <ProductImage
                            src={product.imageUrl}
                            alt={product.name}
                            seed={product.id}
                            rounded="0"
                            className="transition-transform duration-500 group-hover:scale-105"
                          />
                          {product.isFeatured && (
                            <span
                              className="absolute start-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                              style={{
                                background: "var(--m-secondary)",
                                color: "var(--m-secondary-contrast)",
                              }}
                            >
                              ★
                            </span>
                          )}
                          {!product.isAvailable && (
                            <UnavailableOverlay label={t.publicMenu.unavailable} />
                          )}
                        </div>

                        <div className="px-3 pt-3">
                          <h3 className="line-clamp-1 text-sm font-bold">
                            {product.name}
                          </h3>
                          {product.shortDescription && (
                            <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-60">
                              {product.shortDescription}
                            </p>
                          )}
                        </div>
                      </button>

                      {/*
                        Price and add-to-cart share a row, in normal flow.

                        The button used to be `absolute end-3 bottom-3`, outside
                        the text's flow and unknown to it, so it landed on top
                        of the short description. Reserving a 56px band below
                        the text fixed the overlap but paid for it in height on
                        every card, including the ones with two words of
                        description.

                        In flow it costs one row and nothing else: a short
                        description leaves the button immediately beneath it, a
                        long one pushes this row down by exactly as much as the
                        extra line needs. The card is as tall as its contents
                        and never taller.

                        Outside the button above rather than inside it, because
                        a control nested in a control is invalid — which is why
                        it was positioned absolutely to begin with.
                      */}
                      <div className="flex items-center gap-2 px-3 pt-2 pb-3">
                        <PriceTag
                          price={product.price}
                          compareAt={product.compareAtPrice}
                          show={data.restaurant.showPrices}
                          locale={locale}
                          className="min-w-0 text-sm"
                        />

                        {restaurant.onlineOrderingEnabled && product.isAvailable && (
                          <AddToCartButton
                            inCart={inCart}
                            onAdd={() => addToCart(product)}
                            label={`${t.publicMenu.addToCart} — ${product.name}`}
                            locale={locale}
                            className="ms-auto shrink-0"
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      <MenuFooter />

      <CartBar />
    </div>
  );
}
