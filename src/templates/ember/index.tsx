"use client";

import * as React from "react";
import { Flame } from "lucide-react";
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
import { MenuFooter } from "../shared/footer";

/**
 * Ember — loud and appetising. Full-bleed hero, chunky category chips and
 * wide horizontal cards with large imagery. Built for burgers, pizza and
 * anything where the photo sells the dish.
 */
export default function EmberTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, filtered, isSearching } = useMenuSearch(data.categories);
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  const featured = React.useMemo(
    () =>
      data.categories
        .flatMap((c) => c.products)
        .filter((p) => p.isFeatured && p.isAvailable),
    [data.categories],
  );

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl pb-28">
      <header className="relative h-56 overflow-hidden">
        {restaurant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="size-full"
            style={{
              background: `linear-gradient(135deg, var(--m-primary), var(--m-secondary))`,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, var(--m-bg) 2%, transparent 70%)",
          }}
        />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="size-16 shrink-0 rounded-[var(--m-radius)] object-cover shadow-lg"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-black drop-shadow-sm">
              {restaurant.name}
            </h1>
            {restaurant.tagline && (
              <p className="mt-0.5 line-clamp-1 text-sm font-semibold opacity-75">
                {restaurant.tagline}
              </p>
            )}
          </div>
          <LanguageToggle
            className="shadow-lg"
            style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
          />
          <CartButton
            className="shadow-lg"
            style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
          />
        </div>
      </header>

      <div className="px-4 pt-4">
        <SearchField value={query} onChange={setQuery} />
      </div>

      {/*
        Category rail, directly under the header.

        It sits above the featured strip rather than below it so the header
        reads as one block — cover, search, categories — and the offers become
        the first thing *in* the menu rather than something wedged between the
        header and the way of navigating it. It keeps `sticky top-0`, so it
        still parks at the top once the cover has scrolled away and stays the
        way you move between categories.
      */}
      {!isSearching && (
        <div
          className="sticky top-0 z-30 mt-4 py-2.5"
          style={{ background: "var(--m-bg)" }}
        >
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            className="gap-2 px-4"
          />
        </div>
      )}

      {/* Featured rail — a merchandising surface Ember gets and the others don't. */}
      {!isSearching && featured.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2.5 flex items-center gap-2 px-4 text-sm font-black">
            <Flame className="size-4" style={{ color: "var(--m-primary)" }} />
            {locale === "fa" ? "پیشنهاد ویژه" : "Featured"}
          </h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
            {featured.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => openProduct(product)}
                className="menu-surface w-40 shrink-0 overflow-hidden text-start transition-transform active:scale-[0.98]"
              >
                <ProductImage
                  src={product.imageUrl}
                  alt={product.name}
                  seed={product.id}
                  rounded="0"
                  className="h-24 w-full object-cover"
                />
                <div className="p-2.5">
                  <p className="line-clamp-1 text-xs font-bold">{product.name}</p>
                  <PriceTag
                    price={product.price}
                    show={restaurant.showPrices}
                    locale={locale}
                    className="mt-1 text-xs"
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <main id="main" className="px-4 pt-4">
        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              className="mb-9 scroll-mt-24"
            >
              <h2 className="mb-3 text-xl font-black">{category.name}</h2>

              <div className="space-y-3">
                {category.products.map((product) => {
                  const inCart = cart.quantityOf(product.id);
                  return (
                    <article
                      key={product.id}
                      className="menu-surface relative flex overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => openProduct(product)}
                        className="flex min-w-0 flex-1 items-stretch gap-3 p-3 text-start"
                      >
                        <div className="relative size-24 shrink-0 overflow-hidden rounded-[var(--m-radius-sm)]">
                          <ProductImage
                            src={product.imageUrl}
                            alt={product.name}
                            seed={product.id}
                            rounded="var(--m-radius-sm)"
                          />
                          {!product.isAvailable && (
                            <UnavailableOverlay label={t.publicMenu.unavailable} />
                          )}
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 text-base font-extrabold">
                              {product.name}
                            </h3>
                            {product.shortDescription && (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-60">
                                {product.shortDescription}
                              </p>
                            )}
                          </div>

                          {/*
                            Price only. Preparation time used to sit beside it
                            and is now shown in the product sheet alone.

                            The card puts the add-to-cart button at
                            `absolute end-3 bottom-3`, so this row shares its
                            line with a 44px control. A second item pushed the
                            price far enough along that on narrow phones the
                            two collided and the minutes disappeared under the
                            button. Prep time is also the least urgent thing
                            here — it matters once a guest is deciding on a
                            dish, which is exactly when the sheet is open.
                          */}
                          <div className="mt-2 flex items-center gap-2">
                            <PriceTag
                              price={product.price}
                              compareAt={product.compareAtPrice}
                              show={restaurant.showPrices}
                              locale={locale}
                              className="text-base"
                            />
                          </div>
                        </div>
                      </button>

                      {restaurant.onlineOrderingEnabled && product.isAvailable && (
                        <AddToCartButton
                          inCart={inCart}
                          onAdd={() => addToCart(product)}
                          label={`${t.publicMenu.addToCart} — ${product.name}`}
                          locale={locale}
                          className="absolute end-3 bottom-3"
                        />
                      )}
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
