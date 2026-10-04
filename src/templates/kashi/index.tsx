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

import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

/**
 * Kashi (کاشی) — Persian tilework.
 *
 * Drawn from Safavid tile panels: the کاشی‌کاری of Isfahan's mosques and the
 * tea houses that borrowed their vocabulary. Three motifs carry it, and each is
 * a real element of that tradition rather than a generic "ethnic" flourish:
 *
 *   • the طاق — the arched frame that crowns each category, echoing an iwan;
 *   • the ستاره هشت‌پر — the eight-pointed star, geometrically the union of two
 *     superimposed squares, which is why it is generated here from that rule
 *     rather than traced by hand;
 *   • the tile field — a low-contrast repeat behind the page, the way a panel
 *     sits against a wall of plain کاشی.
 *
 * Restraint is the whole discipline. Real tilework is flat colour and precise
 * geometry: no gradients, no glow, no depth. The ornament runs at single-digit
 * opacity and the dishes stay the loudest thing on the page — a menu that
 * cannot be read is not a homage to anything.
 *
 * Built for traditional Iranian restaurants, سفره‌خانه and چایخانه.
 */
export default function KashiTemplate({ data }: TemplateProps) {
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
      <TileField />

      <header className="relative px-5 pt-8 pb-6 text-center">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            loading="eager"
            className="mx-auto mb-4 size-16 object-cover"
            style={{
              borderRadius: "var(--m-radius-sm)",
              border: "1px solid var(--m-primary-soft)",
            }}
          />
        ) : null}

        <EightPointStar className="mx-auto mb-3 size-6" />

        <h1 className="text-2xl leading-tight font-black">{restaurant.name}</h1>

        {restaurant.tagline && (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 opacity-70">
            {restaurant.tagline}
          </p>
        )}

        <StarRule className="mt-5" />
      </header>

      <div
        className="sticky top-0 z-30 px-5 py-2.5"
        style={{ background: "var(--m-bg)" }}
      >
        <div className="flex items-center gap-2">
          <SearchField value={query} onChange={setQuery} className="flex-1" />
          <LanguageToggle
            style={{
              border: "1px solid var(--m-primary-soft)",
              color: "var(--m-primary)",
            }}
          />
          <CartButton
            style={{
              border: "1px solid var(--m-primary-soft)",
              color: "var(--m-primary)",
            }}
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

      <main id="main" className="relative px-5 pt-6">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              className="mb-10 scroll-mt-36"
            >
              {/*
                The طاق. A half-round top on a bordered band, with the border
                deliberately omitted along the bottom so the arch reads as the
                opening of the panel below rather than as a closed box.
              */}
              <div
                className="relative px-4 pt-5 pb-3 text-center"
                style={{
                  borderTop: "1px solid var(--m-primary)",
                  borderInline: "1px solid var(--m-primary)",
                  borderStartStartRadius: "999px",
                  borderStartEndRadius: "999px",
                  background: "var(--m-primary-soft)",
                }}
              >
                <EightPointStar className="mx-auto mb-2 size-4" />
                <h2 className="text-base leading-tight font-black">{category.name}</h2>
              </div>

              <ul
                style={{
                  border: "1px solid var(--m-primary-soft)",
                  borderTop: "none",
                }}
              >
                {category.products.map((product, index) => (
                  <KashiTile
                    key={product.id}
                    product={product}
                    isFirst={index === 0}
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
            </section>
          ))
        )}
      </main>

      <MenuFooter />

      <CartBar />
    </div>
  );
}

/**
 * The eight-pointed star, derived rather than drawn.
 *
 * Two squares of equal circumradius, one rotated 45° over the other. Their
 * edges meet at radius R·cos(45°)/cos(22.5°) ≈ 0.7654R, so alternating the
 * outer and inner radii around sixteen vertices reproduces the motif exactly.
 * Hand-picked coordinates would only approximate it, and the eye catches an
 * inexact star immediately — the geometry is the point of the form.
 */
function EightPointStar({ className }: { className?: string }) {
  const points = React.useMemo(() => {
    const INNER = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
    return Array.from({ length: 16 }, (_, i) => {
      const angle = (Math.PI / 8) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? 1 : INNER;
      const x = 50 + 48 * radius * Math.cos(angle);
      const y = 50 + 48 * radius * Math.sin(angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, []);

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <polygon points={points} fill="var(--m-primary)" />
    </svg>
  );
}

/** Three stars on a hairline — the divider used on tile panels and title pages. */
function StarRule({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} aria-hidden>
      <span className="h-px flex-1" style={{ background: "var(--m-primary-soft)" }} />
      <EightPointStar className="size-2.5 opacity-70" />
      <EightPointStar className="size-3.5" />
      <EightPointStar className="size-2.5 opacity-70" />
      <span className="h-px flex-1" style={{ background: "var(--m-primary-soft)" }} />
    </div>
  );
}

/**
 * The tile field behind the page.
 *
 * An SVG `<pattern>` rather than a repeated raster: it is a few hundred bytes,
 * scales to any density without blurring, and takes its colour from the tenant's
 * palette, so a venue that recolours its menu recolours the ornament with it.
 *
 * `fixed` so the field stays put while the menu scrolls over it — a wall does
 * not move — and `-z-10` keeps it strictly behind every template that renders
 * its own background colour.
 */
function TileField() {
  const id = React.useId();

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.07]" aria-hidden>
      <svg width="100%" height="100%" focusable="false">
        <defs>
          <pattern
            id={`kashi-${id}`}
            width="72"
            height="72"
            patternUnits="userSpaceOnUse"
          >
            {/* The interlace: a square on point, with the quarter-arcs that
                turn a grid of stars into a continuous field. */}
            <path
              d="M36 0 L72 36 L36 72 L0 36 Z"
              fill="none"
              stroke="var(--m-primary)"
              strokeWidth="1.5"
            />
            <path
              d="M0 0 L72 72 M72 0 L0 72"
              stroke="var(--m-primary)"
              strokeWidth="0.75"
            />
            <circle cx="36" cy="36" r="8" fill="none" stroke="var(--m-primary)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#kashi-${id})`} />
      </svg>
    </div>
  );
}

function KashiTile({
  product,
  isFirst,
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
  isFirst: boolean;
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

  return (
    <li
      className={isFirst ? "" : "border-t"}
      style={{
        borderColor: "var(--m-primary-soft)",
        background: "var(--m-surface)",
        opacity: product.isAvailable ? 1 : 0.5,
      }}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-3 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{ outlineColor: "var(--m-primary)" }}
        >
          <div
            className="relative size-20 shrink-0 overflow-hidden"
            style={{
              borderRadius: "var(--m-radius-sm)",
              border: "1px solid var(--m-primary-soft)",
            }}
          >
            {/* `size-full` matters for the no-photo case: ProductImage's
                fallback carries no dimensions of its own and would otherwise
                collapse to its placeholder icon inside the tile frame. */}
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              seed={product.id}
              rounded="var(--m-radius-sm)"
              className="size-full"
            />
            {!product.isAvailable && <UnavailableOverlay label={unavailableLabel} />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm leading-6 font-extrabold">
              {product.name}
              <DishTagIcons tags={product.dietaryTags} />
            </h3>

            {product.shortDescription && (
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 opacity-70">
                {product.shortDescription}
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <PriceTag
                price={product.price}
                compareAt={product.compareAtPrice}
                show={showPrices}
                locale={locale}
                className="text-sm"
              />
              {product.prepMinutes ? (
                <span className="inline-flex items-center gap-1 text-[11px] opacity-70">
                  <Clock className="size-3 shrink-0" />
                  <bdi className="tabular-nums">{num(product.prepMinutes)}</bdi>
                  {minutesLabel}
                </span>
              ) : null}
            </div>
          </div>
        </button>

        {canOrder && product.isAvailable && (
          // Squared off to match the tile grid; a circle would be the only
          // curve in a panel built entirely from straight edges.
          <AddToCartButton
            inCart={inCart}
            onAdd={onAdd}
            label={`${addLabel} — ${product.name}`}
            locale={locale}
            className="mt-0.5 shrink-0 !rounded-[var(--m-radius-sm)] !shadow-none"
          />
        )}
      </div>
    </li>
  );
}
