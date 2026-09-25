"use client";

import * as React from "react";
import { useMenu } from "./runtime";
import { bundleSourceFor, useBundlesContaining } from "./use-upsells";
import { useSuggestionAdd, useSuggestionImpressions } from "./suggestion-row";
import { PriceTag } from "./pieces";
import { formatMoney, formatNumber } from "@/lib/format";
import type { MenuProduct } from "../types";

/**
 * "Order it for less" — the meal deals containing the dish on screen.
 *
 * Separate from the ranked suggestion panel because this block says something
 * the panel has no room for: *what is in the deal*. A guest weighing a combo
 * against a single dish needs to see the three things they get and the money
 * they keep, and a one-line row cannot carry that.
 *
 * A bundle is an ordinary product, so adding one is an ordinary add — the same
 * cart, the same options, the same pricing, the same order line. Nothing about
 * checkout, the kitchen board or the reports knows this component exists.
 *
 * Rendered only when there is a deal that can actually be assembled right now;
 * `useBundlesContaining` drops any whose components are sold out, because a
 * combo whose chips are unavailable is not a combo.
 */
export function BundleOffers({ product }: { product: MenuProduct }) {
  const { data, locale, t } = useMenu();
  const offers = useBundlesContaining(product.id);
  const handleAdd = useSuggestionAdd();

  const sources = React.useMemo(() => [product.id], [product.id]);

  /** Reported like any other suggestion, so one report covers every surface. */
  const picks = React.useMemo(
    () =>
      offers.map((offer) => ({
        product: offer.product,
        sourceProductId: bundleSourceFor(offer, sources),
        reason: "bundle" as const,
        saving: offer.saving,
      })),
    [offers, sources],
  );

  useSuggestionImpressions(picks);

  if (offers.length === 0) return null;

  return (
    <section
      aria-labelledby={`restokar-bundles-${product.id}`}
      className="mt-6 rounded-[var(--m-radius-sm)] border p-4"
      style={{ borderColor: "var(--m-border)" }}
    >
      <h3
        id={`restokar-bundles-${product.id}`}
        className="text-sm font-bold"
        style={{ color: "var(--m-text)" }}
      >
        {t.publicMenu.bundleOffersTitle}
      </h3>

      <ul className="mt-3 space-y-3">
        {offers.map((offer, index) => (
          <li key={offer.product.id}>
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-5 font-bold">
                  {offer.product.name}
                </p>

                {/*
                  What is actually in the deal.

                  Names rather than cards: this is a sentence a guest reads, and
                  three photo tiles would make a combo look more important than
                  the dish they came to look at. Wraps freely at 320px.
                */}
                <p
                  className="mt-1 text-xs leading-5"
                  style={{ color: "var(--m-text)", opacity: 0.7 }}
                >
                  <span style={{ fontWeight: 700 }}>{t.publicMenu.bundleIncludes}: </span>
                  {offer.components.map((component, i) => (
                    <React.Fragment key={component.product.id}>
                      {i > 0 && " • "}
                      {/*
                        A quantity is printed only when it is more than one.
                        «۱ × نوشابه» is noise; «۲ × نوشابه» is information.
                        `dir="ltr"` on the numeral, per the RTL convention for
                        every figure in this codebase.
                      */}
                      {component.quantity > 1 && (
                        <span dir="ltr">
                          {formatNumber(component.quantity, locale)}×{" "}
                        </span>
                      )}
                      {component.product.name}
                    </React.Fragment>
                  ))}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <PriceTag
                    price={offer.product.price}
                    compareAt={offer.product.compareAtPrice}
                    show={data.restaurant.showPrices}
                    locale={locale}
                    className="text-xs"
                  />

                  {/*
                    The saving, computed from the live prices of the components
                    on this very page — never stored, so it cannot go stale
                    against them. Absent entirely when a deal saves nothing,
                    rather than printed as zero.
                  */}
                  {offer.saving !== null && data.restaurant.showPrices && (
                    <span
                      className="rounded-[var(--m-radius-xs,0.25rem)] px-1.5 py-0.5 text-[0.6875rem] font-bold"
                      style={{
                        background: "var(--m-primary-soft)",
                        color: "var(--m-primary)",
                      }}
                    >
                      {t.publicMenu.bundleSaving.replace(
                        "{amount}",
                        formatMoney(offer.saving, locale),
                      )}
                    </span>
                  )}
                </div>
              </div>

              {data.restaurant.onlineOrderingEnabled && (
                <button
                  type="button"
                  onClick={() => picks[index] && handleAdd(picks[index])}
                  className="tap-safe shrink-0 rounded-[var(--m-radius-sm)] px-3 text-xs font-bold transition-transform active:scale-95"
                  style={{
                    background: "var(--m-primary)",
                    color: "var(--m-primary-contrast)",
                    minHeight: "2.75rem",
                  }}
                >
                  {t.publicMenu.addToCart}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
