"use client";

import * as React from "react";
import type { TemplateProps } from "../types";
import { useAddToCart, useMenu } from "../shared/runtime";
import { DishTagFilter, DishTagIcons } from "../shared/dish-tags";
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
import { AddToCartButton, PriceTag } from "../shared/pieces";
import { FeaturedStrip } from "../shared/featured";
import { MenuFooter } from "../shared/footer";

/**
 * Linen — a printed menu, on a phone. Warm paper tones, a two-column
 * typographic list with leader dots, and no photography in the list itself.
 * Suits traditional Iranian restaurants where the menu is long and familiar.
 */
export default function LinenTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, tags, setTags, filtered, isSearching } = useMenuSearch(
    data.categories,
  );
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl pb-28">
      <header
        className="mx-3 mt-3 px-6 py-8 text-center"
        style={{
          background: "var(--m-surface)",
          border: "1px solid var(--m-border)",
          outline: "1px solid var(--m-border)",
          outlineOffset: "4px",
        }}
      >
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            className="mx-auto mb-5 size-20 object-contain"
          />
        ) : null}

        <h1 className="text-2xl font-bold tracking-wide">{restaurant.name}</h1>

        {restaurant.tagline && (
          <>
            <div
              className="mx-auto my-3 h-px w-24"
              style={{ background: "var(--m-border)" }}
              aria-hidden
            />
            <p className="text-sm italic opacity-70">{restaurant.tagline}</p>
          </>
        )}

        {restaurant.description && (
          <p className="mx-auto mt-4 max-w-md text-xs leading-7 opacity-60">
            {restaurant.description}
          </p>
        )}
      </header>

      <div
        className="sticky top-0 z-30 mt-4 border-y px-4 py-3"
        style={{ background: "var(--m-bg)", borderColor: "var(--m-border)" }}
      >
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} className="flex-1" />
          <LanguageToggle
            style={{
              border: "1px solid var(--m-border)",
              background: "var(--m-surface)",
              color: "var(--m-primary)",
            }}
          />
          <CartButton
            style={{
              border: "1px solid var(--m-border)",
              background: "var(--m-surface)",
              color: "var(--m-primary)",
            }}
          />
        </div>
        <DishTagFilter value={tags} onChange={setTags} className="mt-2" />

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            variant="underline"
            className="-mx-4 mt-3 gap-3 px-4"
          />
        )}
      </div>

      <main id="main" className="px-4 pt-4">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              // 128px left only 2px above a 126px sticky bar; 144px gives the
              // heading room to read as a heading rather than a hairline.
              className="mb-12 scroll-mt-36"
            >
              <h2 className="mb-1 text-center text-lg font-bold tracking-[0.12em]">
                {category.name}
              </h2>
              <div
                className="mx-auto mb-6 h-px w-20"
                style={{ background: "var(--m-primary)" }}
                aria-hidden
              />

              <ul className="space-y-5">
                {category.products.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-start gap-3"
                    style={{ opacity: product.isAvailable ? 1 : 0.45 }}
                  >
                    <button
                      type="button"
                      onClick={() => openProduct(product)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-start"
                    >
                      {/*
                        No thumbnail here, by design. This is a printed menu: a
                        name, leader dots, a price. The photograph lives in the
                        product sheet, one tap away, so a guest who wants to see
                        the dish can — without turning a typographic list into a
                        card grid, which is what every other template already is.
                      */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          {/*
                            `min-w-0` rather than `shrink-0`: a long name — and
                            "جوجه‌کباب زعفرانی" is long — could not shrink, so on a
                            narrow phone it grew past the dots and collided with
                            the price. It now wraps instead. The price keeps
                            `shrink-0`, because a truncated price is worse than
                            an untidy one.
                          */}
                          <h3 className="min-w-0 text-sm font-bold">
                            {product.name}
                            <DishTagIcons tags={product.dietaryTags} />
                          </h3>
                          <span
                            className="h-[3px] min-w-3 flex-1 translate-y-[-2px] opacity-40"
                            style={{
                              backgroundImage:
                                "radial-gradient(circle, var(--m-text) 1px, transparent 1px)",
                              backgroundSize: "5px 3px",
                              backgroundRepeat: "repeat-x",
                            }}
                            aria-hidden
                          />
                          <PriceTag
                            price={product.price}
                            compareAt={product.compareAtPrice}
                            show={restaurant.showPrices}
                            locale={locale}
                            className="shrink-0 text-sm"
                          />
                        </div>

                        {product.shortDescription && (
                          <p className="mt-1 text-xs leading-6 opacity-60">
                            {product.shortDescription}
                          </p>
                        )}

                        {!product.isAvailable && (
                          <span className="mt-1 inline-block text-[10px] font-bold opacity-70">
                            {t.publicMenu.unavailable}
                          </span>
                        )}
                      </div>
                    </button>

                    {restaurant.onlineOrderingEnabled && product.isAvailable && (
                      // Linen uses the theme's soft corner radius rather than a
                      // full circle, matching its printed-menu character.
                      <AddToCartButton
                        inCart={cart.quantityOf(product.id)}
                        onAdd={() => addToCart(product)}
                        label={`${t.publicMenu.addToCart} — ${product.name}`}
                        locale={locale}
                        className="mt-0.5 shrink-0 !rounded-[var(--m-radius-sm)] !shadow-none"
                        style={
                          cart.quantityOf(product.id) > 0
                            ? {
                                background: "var(--m-primary)",
                                color: "var(--m-primary-contrast)",
                              }
                            : {
                                background: "transparent",
                                border: "1px solid var(--m-primary)",
                                color: "var(--m-primary)",
                              }
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <MenuFooter />

      <CartBar />
    </div>
  );
}
