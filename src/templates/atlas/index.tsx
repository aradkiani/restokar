"use client";

import * as React from "react";
import type { MenuProduct, TemplateProps } from "../types";
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
import { AddToCartButton, PriceTag, ProductImage } from "../shared/pieces";
import { FeaturedStrip } from "../shared/featured";
import { MenuFooter } from "../shared/footer";
import { localizeDigits } from "@/lib/format";

/**
 * Atlas — a Swiss grid applied to a menu.
 *
 * Everything sits on one column rule: a numbered section index down the start
 * edge, headings on a hairline, and rows separated by nothing but a divider.
 * There are no cards, no shadows and no fills — hierarchy comes from weight and
 * space alone, which is also why it stays fast on a weak connection.
 *
 * Photography is optional here: a venue with no images still reads as a
 * deliberate design rather than a list with holes in it.
 */
export default function AtlasTemplate({ data }: TemplateProps) {
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
        className="border-b px-5 pt-8 pb-6"
        style={{ borderColor: "var(--m-text)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[1.75rem] leading-[1.15] font-black tracking-tight">
              {restaurant.name}
            </h1>
            {restaurant.tagline && (
              <p className="mt-2 text-sm leading-6 opacity-70">{restaurant.tagline}</p>
            )}
          </div>

          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              loading="eager"
              className="size-12 shrink-0 object-contain"
            />
          ) : null}
        </div>

        {restaurant.description && (
          <p className="mt-4 max-w-prose text-xs leading-6 opacity-60">
            {restaurant.description}
          </p>
        )}
      </header>

      <div
        className="sticky top-0 z-30 border-b px-5 py-3"
        style={{ background: "var(--m-bg)", borderColor: "var(--m-border)" }}
      >
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} className="flex-1" />
          <LanguageToggle
            style={{
              border: "1px solid var(--m-text)",
              background: "transparent",
              color: "var(--m-text)",
            }}
          />
          <CartButton
            style={{
              border: "1px solid var(--m-text)",
              background: "transparent",
              color: "var(--m-text)",
            }}
          />
        </div>
        <DishTagFilter value={tags} onChange={setTags} className="mt-2" />

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            variant="underline"
            className="-mx-5 mt-2 gap-4 px-5"
          />
        )}
      </div>

      <main id="main" className="px-5 pt-7">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category, index) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              // Must clear the sticky search + chip bar (measured 121px on a
              // 375px viewport); scroll-mt-28 left the heading under it.
              className="mb-11 scroll-mt-36"
            >
              {/* The index is the only ornament in this template, and it earns
                  its place by making a long menu navigable at a glance. */}
              <div
                className="mb-5 flex items-baseline gap-3 border-b pb-2"
                style={{ borderColor: "var(--m-text)" }}
              >
                <span className="text-xs font-bold tabular-nums opacity-40">
                  {localizeDigits(String(index + 1).padStart(2, "0"), locale)}
                </span>
                <h2 className="text-lg leading-tight font-black tracking-tight">
                  {category.name}
                </h2>
              </div>

              <ul>
                {category.products.map((product, productIndex) => (
                  <AtlasRow
                    key={product.id}
                    product={product}
                    isFirst={productIndex === 0}
                    showPrices={restaurant.showPrices}
                    canOrder={restaurant.onlineOrderingEnabled}
                    locale={locale}
                    unavailableLabel={t.publicMenu.unavailable}
                    addLabel={t.publicMenu.addToCart}
                    inCart={cart.quantityOf(product.id)}
                    onOpen={() => openProduct(product)}
                    onAdd={() => addToCart(product)}
                  />
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

function AtlasRow({
  product,
  isFirst,
  showPrices,
  canOrder,
  locale,
  unavailableLabel,
  addLabel,
  inCart,
  onOpen,
  onAdd,
}: {
  product: MenuProduct;
  isFirst: boolean;
  showPrices: boolean;
  canOrder: boolean;
  locale: string;
  unavailableLabel: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const name = product.name;

  return (
    <li
      className={isFirst ? "" : "border-t"}
      style={{
        borderColor: "var(--m-border)",
        opacity: product.isAvailable ? 1 : 0.45,
      }}
    >
      <div className="flex items-start gap-3 py-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: "var(--m-primary)" }}
        >
          {product.imageUrl && (
            <ProductImage
              src={product.imageUrl}
              alt={name}
              seed={product.id}
              className="size-16 shrink-0"
              rounded="var(--m-radius-sm)"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 text-sm leading-6 font-bold">
                {name}
                <DishTagIcons tags={product.dietaryTags} />
              </h3>
              <PriceTag
                price={product.price}
                compareAt={product.compareAtPrice}
                show={showPrices}
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
              <span className="mt-1.5 inline-block text-[11px] font-bold opacity-70">
                {unavailableLabel}
              </span>
            )}
          </div>
        </button>

        {canOrder && product.isAvailable && (
          // Square, borderless and outlined — a filled circle would be the one
          // soft shape in a layout built entirely from straight lines.
          <AddToCartButton
            inCart={inCart}
            onAdd={onAdd}
            label={`${addLabel} — ${product.name}`}
            locale={locale}
            className="mt-0.5 shrink-0 !rounded-[var(--m-radius-sm)] !shadow-none"
            style={
              inCart > 0
                ? {
                    background: "var(--m-primary)",
                    color: "var(--m-primary-contrast)",
                  }
                : {
                    background: "transparent",
                    border: "1px solid var(--m-text)",
                    color: "var(--m-text)",
                  }
            }
          />
        )}
      </div>
    </li>
  );
}
