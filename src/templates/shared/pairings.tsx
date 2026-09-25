"use client";

import * as React from "react";
import { useMenu } from "./runtime";
import { useBundlesContaining, useUpsells } from "./use-upsells";
import {
  SuggestionRow,
  useSuggestionAdd,
  useSuggestionImpressions,
} from "./suggestion-row";
import type { MenuProduct } from "../types";

/**
 * "These go well with it" — suggestions for the dish the guest is looking at.
 *
 * The sibling of `RecommendationStrip`, and now genuinely not a second system:
 * both call `useUpsells`, so both get the owner's pairings, the venue's meal
 * deals, its order history and its featured dishes through one ranked pass, and
 * both report through the same event helpers. What differs is the moment. The
 * strip asks "anything else?" in the cart, when a guest is deciding whether
 * they are finished; this answers "what goes with this?" while they are still
 * looking at the dish — which is when a pairing is a suggestion rather than an
 * upsell.
 *
 * **Two bugs this file used to have**, both from filtering inline instead of
 * going through the engine: it showed *every* configured pairing rather than
 * the three the panel is designed for, and it happily suggested a dish the
 * guest had already put in their basket. The cart strip had neither, because
 * the cart strip called the shared rule.
 *
 * The heading is the owner's own sentence when they have written one. A café
 * can say «کمی خنکتان می‌کند» over an iced drink where a burger says «با اینها
 * عالی می‌شود»; a venue that writes nothing gets the platform's generic line
 * rather than a blank heading.
 */
export function PairingSuggestions({ product }: { product: MenuProduct }) {
  const { t } = useMenu();

  /** One dish prompts these — the one whose sheet is open. */
  const sources = React.useMemo(() => [product.id], [product.id]);

  /*
    Whatever `<BundleOffers>` is already showing above.

    That block gives each meal deal a panel of its own — what it contains, what
    it saves — so repeating the same combo as a one-line row a few hundred
    pixels below is the page saying the same thing twice. Excluded here rather
    than filtered after ranking, so the freed slot goes to the next real
    suggestion instead of being left empty.
  */
  const shownAsBundles = useBundlesContaining(product.id);
  const exclude = React.useMemo(
    () => shownAsBundles.map((offer) => offer.product.id),
    [shownAsBundles],
  );

  const picks = useUpsells(sources, undefined, exclude);
  const handleAdd = useSuggestionAdd();

  /*
    One impression per suggestion while the sheet is open.

    The guest opened this sheet deliberately and the block sits in the flow of
    it, so "rendered" is a fair proxy for "seen". Repeats are collapsed by the
    session key and the unique index, so this over-counts attention rather than
    guests — the same honest limitation the cart strip documents.
  */
  useSuggestionImpressions(picks);

  if (picks.length === 0) return null;

  return (
    <section
      aria-labelledby={`restokar-pairings-${product.id}`}
      className="mt-6 rounded-[var(--m-radius-sm)] p-4"
      style={{ background: "var(--m-primary-soft)" }}
    >
      <h3
        id={`restokar-pairings-${product.id}`}
        className="text-sm font-bold"
        style={{ color: "var(--m-primary)" }}
      >
        {product.pairingNote?.trim() || t.publicMenu.pairingsFallback}
      </h3>

      <ul className="mt-3 space-y-2">
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
