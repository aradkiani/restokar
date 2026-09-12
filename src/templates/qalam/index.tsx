"use client";

import * as React from "react";
import type { MenuProduct, TemplateProps } from "../types";
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
import { AddToCartButton, PriceTag, ProductImage } from "../shared/pieces";
import { FeaturedStrip } from "../shared/featured";
import { MenuFooter } from "../shared/footer";

/**
 * Toranj (ترنج) — an editorial menu.
 *
 * Typography is the whole of this template: there are no cards, no fills, no
 * shadows and no rounded containers.
 *
 * The templateId, the directory and the component names are still `qalam`,
 * which was the template's original name. Renaming a stored templateId would
 * orphan every venue that had chosen it, so only the display name moved. Hierarchy is built from three things only — the size
 * step between headings and body, the amount of space around a block, and a
 * single hairline rule opening each section.
 *
 * The one structural idea is a **lead entry per category**. The first dish in a
 * category gets a wide image, a larger name and its description set in full;
 * everything after it is a quiet, evenly-ruled list. That is not an arbitrary
 * flourish — owners already order their menus deliberately, so the dish sitting
 * at `sortOrder` 0 is the one they put first. Leading with it makes the owner's
 * existing ordering do real editorial work without a new column, a new setting
 * or a decision anyone has to be taught.
 *
 * Photography is genuinely optional. A dish with no image is not given a
 * placeholder — the lead simply becomes a typographic block, so a venue that
 * has photographed nothing still reads as a designed page rather than as a list
 * with holes punched in it.
 *
 * Suited to bistros, wine bars and chef-led kitchens with short, considered
 * menus that change often.
 */
export default function QalamTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, filtered, isSearching } = useMenuSearch(data.categories);
  const activeId = useActiveCategory(filtered.map((c) => c.id));
  const { restaurant } = data;

  const entryProps = (product: MenuProduct) => ({
    product,
    showPrices: restaurant.showPrices,
    canOrder: restaurant.onlineOrderingEnabled,
    locale,
    unavailableLabel: t.publicMenu.unavailable,
    addLabel: t.publicMenu.addToCart,
    inCart: cart.quantityOf(product.id),
    onOpen: () => openProduct(product),
    onAdd: () => addToCart(product),
  });

  return (
    <div className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl pb-28">
      {/*
        A plain full-bleed band, with the masthead set beneath it rather than
        floated over it. Text laid over an uncontrolled tenant photograph is a
        contrast accident waiting to happen — the venue chooses the image, and
        no overlay opacity is right for every one of them.
      */}
      {restaurant.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={restaurant.coverUrl}
          alt=""
          loading="eager"
          className="h-40 w-full object-cover sm:h-52"
        />
      ) : null}

      <header className="px-5 pt-9 pb-7">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            loading="eager"
            className="mb-5 size-14 object-contain"
          />
        ) : null}

        {/*
          No `tracking-*` anywhere in this template, and that is a Persian
          typesetting decision rather than an oversight. Arabic-script letters
          join; letter-spacing pulls those joins apart and renders a word as
          disconnected glyphs. Latin display type is routinely tracked, so
          porting that habit into an RTL product is one of the clearest tells
          that a layout was designed LTR-first and mirrored afterwards.
          Hierarchy here comes from size and weight, which are script-neutral.
        */}
        <h1 className="text-[1.75rem] leading-[1.25] font-bold">{restaurant.name}</h1>

        {restaurant.tagline && (
          <p className="mt-2.5 text-sm leading-7 opacity-70">{restaurant.tagline}</p>
        )}

        {restaurant.description && (
          <>
            <div
              className="my-6 h-px w-full"
              style={{ background: "var(--m-border)" }}
              aria-hidden
            />
            <p className="max-w-prose text-xs leading-7 opacity-70">
              {restaurant.description}
            </p>
          </>
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
              border: "1px solid var(--m-border)",
              color: "var(--m-text)",
            }}
          />
          <CartButton
            style={{
              border: "1px solid var(--m-border)",
              color: "var(--m-text)",
            }}
          />
        </div>

        {!isSearching && (
          <CategoryChips
            categories={filtered}
            activeId={activeId}
            variant="underline"
            className="-mx-5 mt-2.5 gap-5 px-5"
          />
        )}
      </div>

      <main id="main" className="px-5">
        <FeaturedStrip />

        {filtered.length === 0 ? (
          <MenuEmpty message={t.common.empty} />
        ) : (
          filtered.map((category) => {
            /*
             * Search results are shown as a flat list. Promoting a "lead" out
             * of a filtered set would be editorialising the guest's own query —
             * the first match is not a recommendation, it is just the first
             * match, and giving it a wide image implies an emphasis the venue
             * never expressed.
             */
            const lead = isSearching ? undefined : category.products[0];
            const rest = isSearching ? category.products : category.products.slice(1);

            return (
              <section
                key={category.id}
                id={`cat-${category.id}`}
                className="scroll-mt-36 pt-9"
              >
                <div
                  className="h-px w-full"
                  style={{ background: "var(--m-text)" }}
                  aria-hidden
                />
                <h2 className="mt-4 mb-6 text-[1.375rem] leading-tight font-bold">
                  {category.name}
                </h2>

                {lead && <QalamLead {...entryProps(lead)} />}

                {rest.length > 0 && (
                  <ul className={lead ? "mt-2" : undefined}>
                    {rest.map((product, index) => (
                      <QalamRow
                        key={product.id}
                        {...entryProps(product)}
                        isFirst={index === 0 && !lead}
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

interface EntryProps {
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

/** The first dish in a category: wide image where one exists, and room to read. */
function QalamLead({
  product,
  showPrices,
  canOrder,
  locale,
  unavailableLabel,
  addLabel,
  inCart,
  onOpen,
  onAdd,
}: EntryProps) {
  return (
    <article className="pb-7" style={{ opacity: product.isAvailable ? 1 : 0.45 }}>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: "var(--m-primary)" }}
      >
        {product.imageUrl && (
          <div className="mb-4 aspect-[16/9] w-full overflow-hidden">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              seed={product.id}
              rounded="var(--m-radius-sm)"
              className="size-full"
            />
          </div>
        )}

        <h3 className="text-[1.0625rem] leading-7 font-bold">{product.name}</h3>

        {/* Unclamped: the lead is the one entry with room for its full line. */}
        {product.shortDescription && (
          <p className="mt-1.5 text-xs leading-7 opacity-70">
            {product.shortDescription}
          </p>
        )}

        {!product.isAvailable && (
          <span className="mt-2 inline-block text-[11px] font-semibold opacity-70">
            {unavailableLabel}
          </span>
        )}
      </button>

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <PriceTag
          price={product.price}
          compareAt={product.compareAtPrice}
          show={showPrices}
          locale={locale}
          className="min-w-0 text-[0.9375rem]"
        />

        {canOrder && product.isAvailable && (
          <AddToCartButton
            inCart={inCart}
            onAdd={onAdd}
            label={`${addLabel} — ${product.name}`}
            locale={locale}
            className="shrink-0 !rounded-[var(--m-radius-sm)] !shadow-none"
            style={
              inCart > 0
                ? { background: "var(--m-primary)", color: "var(--m-primary-contrast)" }
                : {
                    background: "transparent",
                    border: "1px solid var(--m-text)",
                    color: "var(--m-text)",
                  }
            }
          />
        )}
      </div>
    </article>
  );
}

/** Everything after the lead: an evenly ruled list, one rule per entry. */
function QalamRow({
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
}: EntryProps & { isFirst: boolean }) {
  return (
    <li
      className={isFirst ? "" : "border-t"}
      style={{
        borderColor: "var(--m-border)",
        opacity: product.isAvailable ? 1 : 0.45,
      }}
    >
      <div className="flex items-start gap-4 py-4">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: "var(--m-primary)" }}
        >
          <h3 className="text-sm leading-6 font-semibold">{product.name}</h3>

          {product.shortDescription && (
            <p className="mt-1 line-clamp-2 text-xs leading-6 opacity-70">
              {product.shortDescription}
            </p>
          )}

          {!product.isAvailable && (
            <span className="mt-1.5 inline-block text-[11px] font-semibold opacity-70">
              {unavailableLabel}
            </span>
          )}
        </button>

        {/*
          Price and control sit in a fixed column at the end of the row, so the
          prices of every entry in a category align vertically no matter how
          long the dish names are. `items-end` keeps that column flush against
          the end edge, which is the right edge in Persian and the left in
          English — the alignment follows the script rather than being pinned to
          one physical side.
        */}
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <PriceTag
            price={product.price}
            compareAt={product.compareAtPrice}
            show={showPrices}
            locale={locale}
            className="text-sm"
          />

          {canOrder && product.isAvailable && (
            <AddToCartButton
              inCart={inCart}
              onAdd={onAdd}
              label={`${addLabel} — ${product.name}`}
              locale={locale}
              className="!size-9 !rounded-[var(--m-radius-sm)] !shadow-none"
              style={
                inCart > 0
                  ? { background: "var(--m-primary)", color: "var(--m-primary-contrast)" }
                  : {
                      background: "transparent",
                      border: "1px solid var(--m-border)",
                      color: "var(--m-text)",
                    }
              }
            />
          )}
        </div>
      </div>
    </li>
  );
}
