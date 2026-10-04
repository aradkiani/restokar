"use client";

import * as React from "react";
import { Clock } from "lucide-react";
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
import {
  AddToCartButton,
  PriceTag,
  ProductImage,
  UnavailableOverlay,
} from "../shared/pieces";
import { FeaturedStrip } from "../shared/featured";
import { MenuFooter } from "../shared/footer";
import { formatNumber, localizeDigits } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

/**
 * Bloom — a menu built out of curves instead of boxes.
 *
 * Every other template in the catalogue is a rectangle problem: rectangular
 * cards, rectangular thumbnails, rectangular dividers. Bloom deliberately uses
 * none of them. Dishes are circular medallions in a two-column grid, the
 * featured items are capsules, and each category is marked by a leaf.
 *
 * That is not decoration for its own sake — a circle crops a plated dish
 * better than a 4:3 box does. Food photography is almost always centre-weighted
 * (the plate in the middle, the table falling away at the corners), which is
 * precisely the content a circular mask throws away least. The same photograph
 * that looks incidental in a rectangle looks composed in a round one.
 *
 * The cost is text: a circle has no straight edge to align a caption to, so
 * every label here is centred beneath its medallion rather than beside it.
 * Meant for ice-cream counters, juice bars, patisseries and breakfast cafés.
 */
export default function BloomTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, tags, setTags, filtered, isSearching } = useMenuSearch(
    data.categories,
  );
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  const featuredIds = React.useMemo(
    () =>
      new Set(
        data.categories
          .flatMap((c) => c.products)
          .filter((p) => p.isFeatured && p.isAvailable)
          .map((p) => p.id),
      ),
    [data.categories],
  );

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl pb-28">
      <header className="px-5 pt-9 pb-6 text-center">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            loading="eager"
            className="mx-auto mb-4 size-20 rounded-full object-cover"
            style={{ border: "3px solid var(--m-primary-soft)" }}
          />
        ) : null}

        <h1 className="text-2xl leading-tight font-black">{restaurant.name}</h1>
        {restaurant.tagline && (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 opacity-65">
            {restaurant.tagline}
          </p>
        )}
      </header>

      <div
        className="sticky top-0 z-30 px-5 py-2.5"
        style={{ background: "var(--m-bg)" }}
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
        <DishTagFilter value={tags} onChange={setTags} className="mt-2" />

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            className="-mx-5 mt-2.5 px-5"
          />
        )}
      </div>

      <main id="main" className="px-5 pt-5">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category, index) => {
            const capsules = category.products.filter((p) => featuredIds.has(p.id));
            const medallions = category.products.filter((p) => !featuredIds.has(p.id));

            return (
              <section
                key={category.id}
                id={`cat-${category.id}`}
                className="mb-11 scroll-mt-36"
              >
                <div className="mb-5 flex items-center gap-3">
                  {/* A leaf: three round corners and one square. The single
                      straight corner is what keeps it from reading as a blob. */}
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-[50%_0_50%_50%] text-xs font-black tabular-nums"
                    style={{
                      background: "var(--m-primary)",
                      color: "var(--m-primary-contrast)",
                    }}
                    aria-hidden
                  >
                    {localizeDigits(String(index + 1), locale)}
                  </span>
                  <h2 className="min-w-0 text-lg leading-tight font-black">
                    {category.name}
                  </h2>
                </div>

                {/* Featured dishes get the capsule treatment: a full-width
                    pill that breaks the grid's rhythm without needing a badge
                    to announce itself. */}
                {capsules.length > 0 && (
                  <ul className="mb-5 space-y-3">
                    {capsules.map((product) => (
                      <BloomCapsule
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
                  </ul>
                )}

                {medallions.length > 0 && (
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-7">
                    {medallions.map((product) => (
                      <BloomMedallion
                        key={product.id}
                        product={product}
                        showPrices={restaurant.showPrices}
                        canOrder={restaurant.onlineOrderingEnabled}
                        locale={locale}
                        minutesLabel={t.publicMenu.minutes}
                        unavailableLabel={t.publicMenu.unavailable}
                        addLabel={t.publicMenu.addToCart}
                        inCart={cart.quantityOf(product.id)}
                        onOpen={() => openProduct(product)}
                        onAdd={() => addToCart(product)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </main>

      <MenuFooter />

      <CartBar />
    </div>
  );
}

function BloomMedallion({
  product,
  showPrices,
  canOrder,
  locale,
  minutesLabel,
  unavailableLabel,
  addLabel,
  inCart,
  onOpen,
  onAdd,
}: {
  product: MenuProduct;
  showPrices: boolean;
  canOrder: boolean;
  locale: Locale;
  minutesLabel: string;
  unavailableLabel: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const num = (n: number) => formatNumber(n, locale);

  const showButton = canOrder && product.isAvailable;

  return (
    <li
      className="flex flex-col items-center text-center"
      style={{ opacity: product.isAvailable ? 1 : 0.55 }}
    >
      <div className="relative w-full">
        <button
          type="button"
          onClick={onOpen}
          aria-label={product.name}
          className="block w-full overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: "var(--m-primary)" }}
        >
          <div className="relative aspect-square w-full">
            {/* `size-full` matters for the no-photo case: ProductImage's
                fallback carries no dimensions of its own, so without this it
                collapses to its placeholder icon and the medallion stops being
                a circle. */}
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              seed={product.id}
              rounded="9999px"
              className="size-full"
            />
            {!product.isAvailable && <UnavailableOverlay label={unavailableLabel} />}
          </div>
        </button>

        {showButton && (
          /*
           * Straddles the medallion's lower edge, which is the one place a
           * square control can sit against a circle without fighting it.
           *
           * Centring is physical geometry — the midpoint of a circle is the
           * same in both scripts — so `left`/`translate-x` are correct here
           * and, unlike `start-1/2`, cannot mirror into a quarter-offset.
           */
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
            <AddToCartButton
              inCart={inCart}
              onAdd={onAdd}
              label={`${addLabel} — ${product.name}`}
              locale={locale}
              style={{ boxShadow: "0 0 0 3px var(--m-bg)" }}
            />
          </div>
        )}
      </div>

      {/* Clears the button only when there is one to clear. */}
      <h3
        className={`${showButton ? "mt-6" : "mt-3"} line-clamp-2 text-sm font-extrabold`}
      >
        {product.name}
        <DishTagIcons tags={product.dietaryTags} />
      </h3>

      {product.shortDescription && (
        <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-70">
          {product.shortDescription}
        </p>
      )}

      <div className="mt-1.5 flex flex-col items-center gap-1">
        <PriceTag
          price={product.price}
          compareAt={product.compareAtPrice}
          show={showPrices}
          locale={locale}
          className="items-center text-sm"
        />
        {product.prepMinutes ? (
          <span className="inline-flex items-center gap-1 text-[11px] opacity-70">
            <Clock className="size-3 shrink-0" />
            <bdi className="tabular-nums">{num(product.prepMinutes)}</bdi>
            {minutesLabel}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function BloomCapsule({
  product,
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
  showPrices: boolean;
  canOrder: boolean;
  locale: Locale;
  unavailableLabel: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <li
      className="flex items-center gap-3 rounded-full p-2 pe-3"
      style={{
        background: "var(--m-primary-soft)",
        opacity: product.isAvailable ? 1 : 0.55,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: "var(--m-primary)" }}
      >
        <div className="relative size-16 shrink-0 overflow-hidden rounded-full">
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            seed={product.id}
            rounded="9999px"
            className="size-full"
          />
          {!product.isAvailable && <UnavailableOverlay label={unavailableLabel} />}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-extrabold">
            {product.name}
            <DishTagIcons tags={product.dietaryTags} />
          </h3>
          {product.shortDescription && (
            <p className="mt-0.5 line-clamp-1 text-xs leading-5 opacity-70">
              {product.shortDescription}
            </p>
          )}
          <PriceTag
            price={product.price}
            compareAt={product.compareAtPrice}
            show={showPrices}
            locale={locale}
            className="mt-1 text-sm"
          />
        </div>
      </button>

      {canOrder && product.isAvailable && (
        <AddToCartButton
          inCart={inCart}
          onAdd={onAdd}
          label={`${addLabel} — ${product.name}`}
          locale={locale}
          className="shrink-0"
        />
      )}
    </li>
  );
}
