"use client";

import * as React from "react";
import { useMenu } from "./runtime";
import { MAX_UPGRADE_PROMPTS, resolveUpgrade } from "@/lib/upgrades";
import { formatMoney } from "@/lib/format";
import type { MenuOptionGroup, MenuProduct } from "../types";

/**
 * «بزرگش کن + ۴۰٬۰۰۰ تومان» — the size ladder as a one-tap offer.
 *
 * The cheapest upsell in the product, in both senses: it adds no model, no
 * pricing path and no order shape. The dish already had a single-select option
 * group whose choices carry a signed `priceDelta`; the owner marked it as the
 * ladder, and this turns four rows a guest had to read into one line they can
 * act on.
 *
 * **Selects rather than adds.** Tapping an upgrade ticks that choice in the
 * sheet's existing selection and nothing else — the guest still presses the
 * sheet's own add button, and every required question they have not answered is
 * still outstanding. That is deliberate: a size tap is not an answer to "which
 * meat", and a control that skipped the rest of the sheet would produce an
 * order the server rightly refuses.
 *
 * The quoted figure is `extraCost`, not `priceDelta` — the difference from
 * where the guest currently stands. On a ladder of small −10,000 / large
 * +40,000 that starts on small, reaching large costs 50,000, and quoting the
 * stored 40,000 would understate the charge. See `upgrades.ts`.
 */
export function UpgradePrompt({
  product,
  selected,
  onSelect,
}: {
  product: MenuProduct;
  /** The sheet's live selection, so the prompt reflects what is already ticked. */
  selected: Record<string, string[]>;
  onSelect: (groupId: string, choiceId: string) => void;
}) {
  const { locale, t, data } = useMenu();

  const upgrade = React.useMemo(
    () => resolveUpgrade(product.optionGroups as MenuOptionGroup[]),
    [product.optionGroups],
  );

  if (!upgrade) return null;
  if (!data.restaurant.showPrices) return null;

  /*
    Nothing to offer once the guest is already on a dearer rung.

    Without this the prompt would keep advertising "large +40,000" to someone
    who has just chosen large. Recomputing against the live selection rather
    than hiding on first tap means it correctly reappears if they go back down.
  */
  const current = selected[upgrade.groupId]?.[0] ?? upgrade.baseChoiceId;
  const currentDelta =
    product.optionGroups
      .find((group) => group.id === upgrade.groupId)
      ?.choices.find((choice) => choice.id === current)?.priceDelta ?? 0;

  const remaining = upgrade.options
    .filter((option) => option.priceDelta > currentDelta)
    .slice(0, MAX_UPGRADE_PROMPTS);

  if (remaining.length === 0) return null;

  return (
    <section aria-labelledby={`restokar-upgrade-${product.id}`} className="mt-4">
      <h3
        id={`restokar-upgrade-${product.id}`}
        className="text-xs font-bold"
        style={{ color: "var(--m-text)", opacity: 0.7 }}
      >
        {t.publicMenu.upgradeTitle}
      </h3>

      {/* Wraps rather than scrolling: two chips fit a 320px row, and a third
          that wrapped is better than one a guest has to discover by swiping. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {remaining.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(upgrade.groupId, option.id)}
            className="tap-safe rounded-[var(--m-radius-sm)] border px-3 text-xs font-bold transition-colors"
            style={{
              borderColor: "var(--m-primary)",
              color: "var(--m-primary)",
              background: "transparent",
              minHeight: "2.75rem",
            }}
          >
            {/*
              The price rides inside the label rather than beside it, so a
              screen reader announces «بزرگ + ۴۰٬۰۰۰ تومان» as one offer. The
              figure is already localised money, and `dir` is left alone because
              the whole string is a sentence in the menu's language.
            */}
            {t.publicMenu.upgradePrompt
              .replace("{name}", option.name)
              .replace("{amount}", formatMoney(option.extraCost, locale))}
          </button>
        ))}
      </div>
    </section>
  );
}
