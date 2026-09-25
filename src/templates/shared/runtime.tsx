"use client";

import * as React from "react";
import { CartProvider, useCart } from "./cart";
import { ProductSheet } from "./product-sheet";
import { CartDrawer } from "./cart-drawer";
import { UpsellSheet } from "./upsell-sheet";
import { reportMenuView } from "./menu-view-events";
import type { MenuData, MenuProduct } from "../types";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/client";

interface MenuRuntimeValue {
  data: MenuData;
  locale: Locale;
  t: ReturnType<typeof getDictionary>;
  preview: boolean;
  /** Prefilled from ?table= on the QR link so guests never retype it. */
  presetTable: string | null;
  /**
   * `recommendedFrom` carries the suggestion that led here through the sheet.
   *
   * A suggested dish with a required choice cannot be added in one tap, so it
   * opens its sheet exactly like any other — and the attribution has to survive
   * that detour, or every upsell of a configurable dish would go uncounted.
   */
  openProduct: (
    product: MenuProduct,
    recommendedFrom?: string | null,
    fromFeatured?: boolean,
  ) => void;
  /** Set while a sheet opened from a merchandising surface is on screen. */
  recommendedFrom: string | null;
  fromFeatured: boolean;
  /**
   * Offer whatever goes with a dish, now that it is in the basket.
   *
   * Called by `useAddToCart` and by the product sheet once its required
   * questions are answered — the two ways a dish reaches the cart.
   */
  offerUpsellsFor: (productId: string) => void;
}

const MenuRuntimeContext = React.createContext<MenuRuntimeValue | null>(null);

export function useMenu(): MenuRuntimeValue {
  const ctx = React.useContext(MenuRuntimeContext);
  if (!ctx) throw new Error("useMenu must be used inside <MenuRuntimeProvider>");
  return ctx;
}

/**
 * What the "+" button on a product card should actually do.
 *
 * A dish with a required choice cannot be added from the card: there is no
 * answer to "chicken or beef?" in a single tap, and the server rightly refuses
 * an order that skipped a required group. So the card opens the product sheet
 * instead, and the guest lands exactly where the question is asked.
 *
 * Optional groups do not interrupt. Someone tapping "+" on a burger has said
 * what they want, and stopping them to decline extra cheese is friction that
 * earns nothing.
 *
 * Lives here rather than in each template so all six behave identically — the
 * same reason the localisation was centralised.
 */
export function useAddToCart(): (
  product: MenuProduct,
  recommendedFrom?: string | null,
  fromFeatured?: boolean,
) => void {
  const { openProduct, offerUpsellsFor } = useMenu();
  const cart = useCart();

  return React.useCallback(
    (
      product: MenuProduct,
      recommendedFrom: string | null = null,
      fromFeatured = false,
    ) => {
      const needsAnswer = product.optionGroups.some((group) => group.isRequired);
      if (needsAnswer) {
        // The sheet asks the question and adds the dish itself, so both
        // attributions are handed to it rather than applied here.
        openProduct(product, recommendedFrom, fromFeatured);
        return;
      }
      cart.add(product, 1, "", [], recommendedFrom, fromFeatured);

      /*
        And ask what goes with it.

        Here rather than inside `cart.add` because this is the single funnel
        every template adds through, while `add` is also called by the product
        sheet — which raises the sheet itself once the guest has answered its
        required questions. Putting it in the cart would fire it for both and
        stack two sheets.

        A dish with nothing to suggest opens nothing: `UpsellSheet` resolves the
        list first and closes immediately when it is empty.
      */
      offerUpsellsFor(product.id);
    },
    [openProduct, cart, offerUpsellsFor],
  );
}

/**
 * Owns every interactive concern of the public menu: cart, product detail
 * sheet and checkout. Templates stay purely presentational and get all of this
 * behaviour — including future improvements — for free.
 */
export function MenuRuntimeProvider({
  data,
  locale,
  preview = false,
  presetTable = null,
  children,
}: {
  data: MenuData;
  locale: Locale;
  preview?: boolean;
  presetTable?: string | null;
  children: React.ReactNode;
}) {
  const [activeProduct, setActiveProduct] = React.useState<MenuProduct | null>(null);
  const [recommendedFrom, setRecommendedFrom] = React.useState<string | null>(null);
  const [fromFeatured, setFromFeatured] = React.useState(false);
  /** The dish whose suggestions are being offered, if any. */
  const [upsellFor, setUpsellFor] = React.useState<string | null>(null);
  const t = React.useMemo(() => getDictionary(locale), [locale]);

  /*
    One "this menu was opened" report per page load.

    Here rather than in a template, because every template renders through this
    provider and a count that depended on which design a venue had chosen would
    be worthless. Sets no state, so it does not add to the effects the lint rule
    tracks; `reportMenuView` is idempotent per page load on its own.
  */
  React.useEffect(() => {
    reportMenuView({ slug: data.restaurant.slug, preview, table: presetTable });
  }, [data.restaurant.slug, preview, presetTable]);

  const value = React.useMemo<MenuRuntimeValue>(
    () => ({
      data,
      locale,
      t,
      preview,
      presetTable,
      recommendedFrom,
      fromFeatured,
      openProduct: (product, from = null, featured = false) => {
        setActiveProduct(product);
        setRecommendedFrom(from);
        setFromFeatured(featured);
      },
      /*
        Re-triggered even for the same dish: a guest adding two burgers in a row
        should be asked again if they skipped the question the first time.
        Clearing first makes the second call a real state change.
      */
      offerUpsellsFor: (productId: string) => {
        setUpsellFor(null);
        setUpsellFor(productId);
      },
    }),
    [data, locale, t, preview, presetTable, recommendedFrom, fromFeatured],
  );

  return (
    <MenuRuntimeContext.Provider value={value}>
      <CartProvider slug={data.restaurant.slug} preview={preview}>
        {children}
        <ProductSheet
          product={activeProduct}
          onClose={() => {
            setActiveProduct(null);
            // Cleared with the sheet so the next dish opened from the menu is
            // not credited to whatever surface happened to be open before.
            setRecommendedFrom(null);
            setFromFeatured(false);
          }}
        />
        <UpsellSheet productId={upsellFor} onClose={() => setUpsellFor(null)} />
        <CartDrawer />
      </CartProvider>
    </MenuRuntimeContext.Provider>
  );
}
