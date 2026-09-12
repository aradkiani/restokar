"use client";

import * as React from "react";
import { Gift } from "lucide-react";
import type { MenuCategory, MenuProduct, TemplateProps } from "../types";
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
import { splitSouvenirs } from "../shared/souvenir";

/**
 * Bazaar — a two-column market stall.
 *
 * Built for venues that sell more than meals: a tourist-city سفره‌خانه with
 * saffron and gaz on the counter, a café with beans by the bag. Food is laid
 * out as a plain paired grid, and anything the owner has filed under «سوغاتی»
 * is lifted out and given its own section at the foot of the menu, so a guest
 * browsing dinner is not interrupted by gift boxes halfway down.
 *
 * Structure over decoration: flat surfaces, one hairline border, a single
 * accent rule under each heading. Nothing here animates on load.
 */
export default function BazaarTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, filtered, isSearching } = useMenuSearch(data.categories);
  const { restaurant } = data;

  // Souvenirs are pulled to the end regardless of the owner's sort order, but
  // stay in the chip rail so a guest can still jump straight to them.
  const { food, souvenirs } = React.useMemo(() => splitSouvenirs(filtered), [filtered]);
  const ordered = React.useMemo(() => [...food, ...souvenirs], [food, souvenirs]);
  const activeId = useActiveCategory(ordered.map((c) => c.id));

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-3xl pb-28">
      <header className="px-4 pt-5 pb-4">
        <div className="flex items-start gap-3">
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              loading="eager"
              className="size-14 shrink-0 object-contain"
              style={{ borderRadius: "var(--m-radius-sm)" }}
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-black">{restaurant.name}</h1>
            {restaurant.tagline && (
              <p className="mt-1 text-sm opacity-70">{restaurant.tagline}</p>
            )}
          </div>
        </div>

        {restaurant.description && (
          <p className="mt-3 text-xs leading-6 opacity-60">{restaurant.description}</p>
        )}
      </header>

      <div
        className="sticky top-0 z-30 border-y px-4 py-3"
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

        {!isSearching && (
          <CategoryChips
            categories={ordered}
            activeId={activeId}
            className="-mx-4 mt-3 px-4"
          />
        )}
      </div>

      <main id="main" className="px-4 pt-5">
        <FeaturedStrip />

        {ordered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          <>
            {food.map((category) => (
              <MenuSection key={category.id} category={category}>
                <div className="grid grid-cols-2 gap-3">
                  {category.products.map((product) => (
                    <StallCard
                      key={product.id}
                      product={product}
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
                </div>
              </MenuSection>
            ))}

            {souvenirs.map((category) => (
              <SouvenirSection
                key={category.id}
                category={category}
                showPrices={restaurant.showPrices}
                canOrder={restaurant.onlineOrderingEnabled}
                locale={locale}
                unavailableLabel={t.publicMenu.unavailable}
                addLabel={t.publicMenu.addToCart}
                quantityOf={cart.quantityOf}
                onOpen={openProduct}
                onAdd={addToCart}
              />
            ))}
          </>
        )}
      </main>

      <MenuFooter />

      <CartBar />
    </div>
  );
}

/** Shared heading treatment so food and souvenir sections read as one menu. */
function MenuSection({
  category,
  children,
}: {
  category: MenuCategory;
  children: React.ReactNode;
}) {
  const name = category.name;

  return (
    // scroll-mt clears the sticky search + chip bar; without it the heading
    // lands underneath the bar when a chip is tapped.
    <section id={`cat-${category.id}`} className="mb-9 scroll-mt-36">
      <div className="mb-4">
        <h2 className="text-base font-black">{name}</h2>
        <div
          className="mt-1.5 h-0.5 w-8"
          style={{ background: "var(--m-primary)" }}
          aria-hidden
        />
      </div>
      {children}
    </section>
  );
}

interface CardProps {
  product: MenuProduct;
  showPrices: boolean;
  canOrder: boolean;
  locale: string;
  unavailableLabel: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
}

function StallCard({
  product,
  showPrices,
  canOrder,
  locale,
  unavailableLabel,
  addLabel,
  inCart,
  onOpen,
  onAdd,
}: CardProps) {
  const name = product.name;

  return (
    <article
      className="relative flex flex-col overflow-hidden"
      style={{
        background: "var(--m-surface)",
        border: "1px solid var(--m-border)",
        borderRadius: "var(--m-radius)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: "var(--m-primary)" }}
      >
        {/* Fixed ratio reserves the space before the image loads, so the grid
            does not jump as photos arrive. */}
        <div className="relative aspect-[4/3] w-full">
          <ProductImage
            src={product.imageUrl}
            alt={name}
            seed={product.id}
            className="size-full"
            rounded="0"
          />
          {!product.isAvailable && <UnavailableOverlay label={unavailableLabel} />}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="text-sm leading-6 font-bold">{name}</h3>
          {product.shortDescription && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-60">
              {product.shortDescription}
            </p>
          )}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <PriceTag
          price={product.price}
          compareAt={product.compareAtPrice}
          show={showPrices}
          locale={locale}
          /*
            `text-xs`, not `text-sm`. These cards sit two-up, so at 320px each
            one is 138px wide and this row has to hold a price, a strike-through
            "was" price and a 40px add button. At 14px the price was squeezed to
            64px and wrapped against the button; at 12px it fits.
          */
          className="min-w-0 text-xs"
        />
        {canOrder && product.isAvailable && (
          <AddToCartButton
            inCart={inCart}
            onAdd={onAdd}
            label={`${addLabel} — ${product.name}`}
            locale={locale}
            className="shrink-0 !rounded-[var(--m-radius-sm)] !shadow-none"
          />
        )}
      </div>
    </article>
  );
}

/**
 * The souvenir shelf.
 *
 * Deliberately a different shape from the food grid — a horizontal row per item
 * with room for a longer description — because a guest reads these the way they
 * read a shop shelf rather than a menu. It still uses the same surface, border,
 * radius and price component, so it reads as part of the same document.
 */
function SouvenirSection({
  category,
  showPrices,
  canOrder,
  locale,
  unavailableLabel,
  addLabel,
  quantityOf,
  onOpen,
  onAdd,
}: {
  category: MenuCategory;
  showPrices: boolean;
  canOrder: boolean;
  locale: string;
  unavailableLabel: string;
  addLabel: string;
  quantityOf: (id: string) => number;
  onOpen: (product: MenuProduct) => void;
  onAdd: (product: MenuProduct) => void;
}) {
  const { t } = useMenu();
  const name = category.name;

  return (
    <section id={`cat-${category.id}`} className="mb-9 scroll-mt-36">
      {/* A tinted band marks the shift from menu to shop without a new palette:
          --m-primary-soft is the theme's own accent at low alpha. */}
      <div
        className="mb-4 flex items-center gap-2.5 px-3 py-2.5"
        style={{
          background: "var(--m-primary-soft)",
          borderRadius: "var(--m-radius-sm)",
        }}
      >
        <Gift className="size-4 shrink-0" style={{ color: "var(--m-primary)" }} />
        <h2 className="text-base font-black">{name}</h2>
      </div>

      <ul className="space-y-3">
        {category.products.map((product) => {
          const productName = product.name;
          const inCart = quantityOf(product.id);

          return (
            <li
              key={product.id}
              className="relative flex items-stretch gap-3 overflow-hidden"
              style={{
                background: "var(--m-surface)",
                border: "1px solid var(--m-border)",
                borderRadius: "var(--m-radius)",
              }}
            >
              <button
                type="button"
                onClick={() => onOpen(product)}
                className="flex min-w-0 flex-1 items-stretch gap-3 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={{ outlineColor: "var(--m-primary)" }}
              >
                <div className="relative aspect-square w-24 shrink-0 sm:w-28">
                  <ProductImage
                    src={product.imageUrl}
                    alt={productName}
                    seed={product.id}
                    className="size-full"
                    rounded="0"
                  />
                  {!product.isAvailable && (
                    <UnavailableOverlay label={unavailableLabel} />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pe-1">
                  <h3 className="text-sm font-bold">{productName}</h3>
                  {product.shortDescription && (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-60">
                      {product.shortDescription}
                    </p>
                  )}
                  {!product.isAvailable && (
                    <span className="mt-1.5 text-[11px] font-bold opacity-70">
                      {t.publicMenu.unavailable}
                    </span>
                  )}
                </div>
              </button>

              <div className="flex shrink-0 flex-col items-end justify-center gap-2 py-3 pe-3">
                <PriceTag
                  price={product.price}
                  compareAt={product.compareAtPrice}
                  show={showPrices}
                  locale={locale}
                  /*
                    Souvenirs carry the longest prices on the platform — saffron
                    runs to seven digits, with a "was" price above it. At 14px
                    this column took 115px of a 288px row and left «زعفران سرگل»
                    47px to sit in. 12px hands that width back to the name.
                  */
                  className="items-end text-xs"
                />
                {canOrder && product.isAvailable && (
                  <AddToCartButton
                    inCart={inCart}
                    onAdd={() => onAdd(product)}
                    label={`${addLabel} — ${product.name}`}
                    locale={locale}
                    className="!rounded-[var(--m-radius-sm)] !shadow-none"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
