"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
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
import { cn } from "@/lib/utils";

/**
 * Reel — one horizontal rail per category.
 *
 * Every other template stacks the whole menu into a single vertical column, so
 * a venue with nine categories buries the last one under a hundred rows of
 * scrolling. Here each category keeps its own horizontal track: the page scrolls
 * vertically through *categories*, and dishes scroll sideways inside them. A
 * long menu therefore costs one screen per category rather than one per dish.
 *
 * The trade is that sideways content can be missed entirely, so the card width
 * is deliberately fractional — the next card always peeks in from the edge,
 * which is the only honest signal that a track continues. A rail whose cards
 * divide evenly into the viewport looks like a finished row and gets no swipe.
 *
 * Built for menus that lead with photography: dessert bars, bubble tea, poke,
 * anywhere the picture does the selling.
 */
export default function ReelTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, filtered, isSearching } = useMenuSearch(data.categories);
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  const renderCard = (product: MenuProduct, className?: string) => (
    <ReelCard
      key={product.id}
      product={product}
      className={className}
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
  );

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl pb-28">
      <header className="px-4 pt-7 pb-5">
        <div className="flex items-start gap-3">
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              loading="eager"
              className="size-14 shrink-0 rounded-[var(--m-radius)] object-cover"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-black">{restaurant.name}</h1>
            {restaurant.tagline && (
              <p className="mt-1 line-clamp-2 text-sm leading-6 opacity-65">
                {restaurant.tagline}
              </p>
            )}
          </div>
        </div>
      </header>

      <div
        className="sticky top-0 z-30 px-4 py-2.5"
        style={{ background: "var(--m-bg)" }}
      >
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} className="flex-1" />
          <LanguageToggle
            style={{
              background: "var(--m-primary-soft)",
              color: "var(--m-primary)",
            }}
          />
          <CartButton
            style={{
              background: "var(--m-primary-soft)",
              color: "var(--m-primary)",
            }}
          />
        </div>

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            className="-mx-4 mt-2.5 px-4"
          />
        )}
      </div>

      <main id="main" className="pt-4">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : isSearching ? (
          /*
           * Search collapses the rails into a plain grid.
           *
           * A query that matches two dishes would otherwise render two
           * one-card tracks, each mostly empty space — the layout would read
           * as broken rather than as a short result list. Results are also the
           * one moment the guest wants everything visible at once, which is
           * exactly what a horizontal track refuses to do.
           */
          <div className="grid grid-cols-2 gap-3 px-4">
            {filtered.flatMap((category) =>
              category.products.map((product) => renderCard(product, "w-full")),
            )}
          </div>
        ) : (
          filtered.map((category) => (
            <CategoryRail key={category.id} category={category}>
              {category.products.map((product) => renderCard(product))}
            </CategoryRail>
          ))
        )}
      </main>

      <MenuFooter />

      <CartBar />
    </div>
  );
}

/**
 * A category heading plus its horizontal track.
 *
 * The arrow buttons appear only on a fine pointer. On a phone the gesture is
 * obvious and the buttons would just eat thumb room; on a desktop — including
 * the owner's design previewer — a track with no visible affordance reads as a
 * clipped row, so there they earn their place.
 */
function CategoryRail({
  category,
  children,
}: {
  category: MenuCategory;
  children: React.ReactNode;
}) {
  const { t, locale } = useMenu();
  const railRef = React.useRef<HTMLUListElement>(null);

  /**
   * Direction is read from the resolved computed style rather than inferred
   * from the locale.
   *
   * `scrollBy({ left })` is a *physical* offset: in an RTL track, advancing
   * means a negative one. Deriving that from `locale === "fa"` would be a
   * second source of truth that silently disagrees with the DOM the moment a
   * venue renders Persian content inside an LTR page, or vice versa — the same
   * class of mirror bug that put the chart tooltip at 807px instead of 91px.
   */
  function nudge(forward: boolean) {
    const rail = railRef.current;
    if (!rail) return;
    const rtl = getComputedStyle(rail).direction === "rtl";
    const step = rail.clientWidth * 0.8;
    rail.scrollBy({ left: (forward !== rtl ? 1 : -1) * step, behavior: "smooth" });
  }

  return (
    <section id={`cat-${category.id}`} className="mb-8 scroll-mt-36">
      <div className="mb-3 flex items-center gap-3 px-4">
        <h2 className="min-w-0 text-lg leading-tight font-black">{category.name}</h2>

        <span
          aria-hidden
          className="h-px flex-1"
          style={{ background: "var(--m-border)" }}
        />

        {/* `hidden` + a fine-pointer override, so coarse pointers never pay for
            controls their gestures already provide. */}
        <div className="hidden gap-1 [@media(pointer:fine)]:flex">
          <RailArrow onClick={() => nudge(false)} label={t.common.previous} back />
          <RailArrow onClick={() => nudge(true)} label={t.common.next} />
        </div>
      </div>

      {/*
        `chip-rail` carries snap points, a hidden scrollbar and
        `overscroll-behavior-x: contain` — the last of which stops a flick at the
        end of a track from turning into a browser back-navigation.

        tabIndex makes the track itself focusable so a keyboard user can pan it
        with the arrow keys; without it a scrollable region is reachable only by
        tabbing through every card inside it.
      */}
      <ul
        ref={railRef}
        tabIndex={0}
        role="group"
        aria-label={category.name}
        className="chip-rail items-stretch gap-3 px-4 pb-1 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: "var(--m-primary)" }}
      >
        {children}
      </ul>
    </section>
  );

  function RailArrow({
    onClick,
    label,
    back,
  }: {
    onClick: () => void;
    label: string;
    back?: boolean;
  }) {
    // The glyph points at physical screen space, so it mirrors with the script:
    // "next" is leftwards in Persian and rightwards in English.
    const Icon = (locale === "fa") === Boolean(back) ? ChevronRight : ChevronLeft;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="tap-safe grid size-8 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-100"
        style={{
          background: "var(--m-primary-soft)",
          color: "var(--m-primary)",
          opacity: 0.75,
        }}
      >
        <Icon className="size-4" />
      </button>
    );
  }
}

function ReelCard({
  product,
  className,
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
  className?: string;
  showPrices: boolean;
  canOrder: boolean;
  locale: string;
  minutesLabel: string;
  unavailableLabel: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const num = (n: number) =>
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  return (
    <li
      // 10.5rem is a deliberate non-divisor of every common phone width: it
      // leaves a sliver of the following card visible, which is what tells a
      // guest the track continues.
      className={cn("menu-surface flex flex-col overflow-hidden", className ?? "w-42")}
      style={{ opacity: product.isAvailable ? 1 : 0.55 }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ outlineColor: "var(--m-primary)" }}
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
          {/* `size-full` matters for the no-photo case: ProductImage's
              fallback carries no dimensions of its own, so without this it
              collapses to the height of its placeholder icon and leaves a
              strip of colour instead of filling the frame. */}
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            seed={product.id}
            rounded="0"
            className="size-full"
          />
          {!product.isAvailable && <UnavailableOverlay label={unavailableLabel} />}

          {product.prepMinutes ? (
            <span
              className="absolute start-2 bottom-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: "var(--m-surface)",
                color: "var(--m-text)",
              }}
            >
              <Clock className="size-3 shrink-0" />
              <bdi className="tabular-nums">{num(product.prepMinutes)}</bdi>
              {minutesLabel}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-3">
          <h3 className="line-clamp-2 text-sm leading-5 font-extrabold">
            {product.name}
          </h3>
          {/* opacity-70 rather than the 55–60 used elsewhere: at this size the
              lighter values compute to ~4.0:1 against the card, under the
              4.5:1 floor for body text. */}
          {product.shortDescription && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-70">
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
          className="min-w-0 text-sm"
        />

        {canOrder && product.isAvailable && (
          <AddToCartButton
            inCart={inCart}
            onAdd={onAdd}
            label={`${addLabel} — ${product.name}`}
            locale={locale}
            className="shrink-0"
          />
        )}
      </div>
    </li>
  );
}
