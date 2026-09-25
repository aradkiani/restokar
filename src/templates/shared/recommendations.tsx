"use client";

import * as React from "react";
import { useMenu } from "./runtime";
import { useCart } from "./cart";
import { useUpsells } from "./use-upsells";
import {
  SuggestionRow,
  useSuggestionAdd,
  useSuggestionImpressions,
} from "./suggestion-row";

/**
 * "Complete your order" — what else this basket is missing.
 *
 * Placed inside the cart sheet rather than given a step of its own. A guest
 * opens the cart when they are deciding whether they are finished, which is the
 * one moment another suggestion is useful rather than an interruption — and it
 * costs no extra modal, no new screen and no change to the ordering flow.
 * Ignoring it is the only thing required to decline: nothing blocks checkout,
 * and there is no dismissal to perform.
 *
 * The selection is `useUpsells`, shared with the product sheet, so the owner's
 * pairings, the venue's meal deals, its own order history and its featured
 * dishes are all considered in one ranked pass. What this file contributes is
 * the heading and the placement.
 *
 * Every dish shown is resolved out of the menu the page already holds, so a
 * suggestion cannot disagree with the menu about name, price or availability —
 * there is only one copy of each.
 */
export function RecommendationStrip() {
  const { t } = useMenu();
  const cart = useCart();

  /** The whole basket prompts the suggestions; the engine excludes it too. */
  const sources = React.useMemo(
    () => cart.lines.map((line) => line.productId),
    [cart.lines],
  );

  /*
    Minus anything the add-time sheet already offered.

    The engine is deterministic, so the same basket produces the same answer in
    both places — without this the guest who declined chips when they added the
    burger would be offered chips again on the way to paying.
  */
  const picks = useUpsells(sources, undefined, cart.suggestedProductIds);
  const handleAdd = useSuggestionAdd();

  /*
    An impression is recorded while the panel is on screen with something in it.

    The cart sheet is opened deliberately by the guest and this sits directly
    above the checkout button, so "rendered" is a fair proxy for "seen" in a way
    it would not be for something below the fold. The honest limitation is that
    a guest who opens the cart and immediately closes it still counts.
  */
  useSuggestionImpressions(picks, cart.isOpen);

  if (picks.length === 0) return null;

  return (
    <section
      aria-labelledby="restokar-recommendations"
      className="border-t px-4 py-3"
      style={{ borderColor: "var(--m-border)" }}
    >
      <h3
        id="restokar-recommendations"
        className="mb-2 text-xs font-bold"
        style={{ color: "var(--m-text)", opacity: 0.7 }}
      >
        {t.publicMenu.recommendationsTitle}
      </h3>

      <ul className="space-y-2">
        {picks.map((pick) => (
          <SuggestionRow
            key={`${pick.reason}-${pick.product.id}`}
            pick={pick}
            onAdd={handleAdd}
          />
        ))}
      </ul>
    </section>
  );
}
