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
import { AddToCartButton, PriceTag } from "../shared/pieces";
import { FeaturedStrip } from "../shared/featured";
import { MenuFooter } from "../shared/footer";
import { localizeDigits } from "@/lib/format";

/**
 * Noir — fine dining. A dark canvas, gold hairlines, generous letter-spacing
 * and a single-column editorial list. Images are small and secondary; the
 * typography carries the page.
 */
export default function NoirTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, filtered, isSearching } = useMenuSearch(data.categories);
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl pb-28">
      <header className="px-6 pt-10 pb-6 text-center">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            className="mx-auto mb-6 size-20 rounded-full object-cover"
            style={{ outline: "1px solid var(--m-primary)", outlineOffset: "4px" }}
          />
        ) : null}

        <div
          className="mx-auto mb-5 h-px w-16"
          style={{ background: "var(--m-primary)" }}
          aria-hidden
        />

        <h1
          className="text-2xl font-light tracking-[0.2em] uppercase"
          style={{ color: "var(--m-primary)" }}
        >
          {restaurant.name}
        </h1>

        {restaurant.tagline && (
          <p className="mt-3 text-xs tracking-[0.15em] uppercase opacity-60">
            {restaurant.tagline}
          </p>
        )}

        <div
          className="mx-auto mt-5 h-px w-16"
          style={{ background: "var(--m-primary)" }}
          aria-hidden
        />
      </header>

      <div
        className="sticky top-0 z-30 border-b px-4 py-3"
        style={{ background: "var(--m-bg)", borderColor: "var(--m-border)" }}
      >
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} className="flex-1" />
          <LanguageToggle
            style={{
              border: "1px solid var(--m-primary)",
              color: "var(--m-primary)",
            }}
          />
          <CartButton
            style={{
              border: "1px solid var(--m-primary)",
              color: "var(--m-primary)",
            }}
          />
        </div>

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            variant="underline"
            className="-mx-4 mt-3 gap-5 px-4 tracking-[0.18em] uppercase"
          />
        )}
      </div>

      {/* Noir stays the airiest of the four, but 40px of padding on top of the
          category block's own spacing pushed the first dish off a phone
          screen entirely. Between-section rhythm (mb-12) is what carries the
          fine-dining feel, not the gap under the nav. */}
      <main id="main" className="px-6 pt-5">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category, categoryIndex) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              // Noir's sticky bar measures 125px on a 375px viewport, so
              // scroll-mt-28 (112px) hid the heading behind it by 13px.
              className="mb-12 scroll-mt-36"
            >
              <div className="mb-6 text-center">
                <span
                  className="block text-[10px] font-light tracking-[0.3em]"
                  style={{ color: "var(--m-primary)" }}
                >
                  {localizeDigits(String(categoryIndex + 1).padStart(2, "0"), locale)}
                </span>
                <h2 className="mt-2 text-base font-light tracking-[0.22em] uppercase">
                  {category.name}
                </h2>
              </div>

              <ul className="space-y-7">
                {category.products.map((product) => (
                  // The detail trigger and the add-to-cart control are siblings
                  // rather than nested: a button inside a button is invalid
                  // markup and breaks keyboard and screen-reader navigation.
                  <li
                    key={product.id}
                    className="group flex items-start gap-4"
                    style={{ opacity: product.isAvailable ? 1 : 0.4 }}
                  >
                    <button
                      type="button"
                      onClick={() => openProduct(product)}
                      className="flex min-w-0 flex-1 items-start gap-4 text-start"
                    >
                      {/*
                        No thumbnail in the list. Noir is a fine-dining card:
                        a name, a dashed leader, a price. The photograph opens
                        with the product sheet — and at 320px a 64px thumbnail
                        plus an unshrinkable name pushed the price clean off the
                        page, scrolling the whole document sideways by 32px.
                      */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-3">
                          {/* `min-w-0` so a long name wraps instead of shoving
                              the price out of the row. See linen/index.tsx. */}
                          <h3 className="min-w-0 text-sm font-medium tracking-wide">
                            {product.name}
                          </h3>
                          <span
                            className="h-px min-w-4 flex-1 translate-y-[-3px]"
                            style={{
                              background: `repeating-linear-gradient(to right, var(--m-border) 0 3px, transparent 3px 6px)`,
                            }}
                            aria-hidden
                          />
                          <PriceTag
                            price={product.price}
                            compareAt={product.compareAtPrice}
                            show={data.restaurant.showPrices}
                            locale={locale}
                            className="shrink-0 text-xs font-light"
                          />
                        </div>

                        {product.shortDescription && (
                          <p className="mt-1.5 text-xs leading-6 opacity-55">
                            {product.shortDescription}
                          </p>
                        )}

                        {!product.isAvailable && (
                          <span
                            className="mt-1.5 inline-block text-[10px] tracking-[0.2em] uppercase"
                            style={{ color: "var(--m-primary)" }}
                          >
                            {t.publicMenu.unavailable}
                          </span>
                        )}
                      </div>
                    </button>

                    {restaurant.onlineOrderingEnabled && product.isAvailable && (
                      // Noir keeps its outlined, unfilled look — only the
                      // surface styling is overridden, not the target size.
                      <AddToCartButton
                        inCart={cart.quantityOf(product.id)}
                        onAdd={() => addToCart(product)}
                        label={`${t.publicMenu.addToCart} — ${product.name}`}
                        locale={locale}
                        className="mt-0.5 shrink-0 !shadow-none"
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
