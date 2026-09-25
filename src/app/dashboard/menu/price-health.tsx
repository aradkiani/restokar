"use client";

import { AlertTriangle, CircleAlert } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { priceHealth, roundMenuPrice } from "@/lib/costing";
import {
  formatMoney,
  formatMoneyWithUnit,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { Locale } from "@/lib/i18n";

export interface MenuPricing {
  /** The venue's display step for menu prices. */
  step: number;
  /** Gross margin floor, in percent, below which the owner is warned. */
  lowMarginPercent: number;
}

/**
 * What a price will look like on the menu, and whether it covers the dish.
 *
 * Kept out of the dish editor, which is already the largest component in the
 * codebase, and computed with the same pure functions the server uses —
 * `roundMenuPrice` for what the guest will see, `priceHealth` for the warning —
 * so the editor can never predict a different shown price, or a different
 * verdict, from the one the menu and the bulk tool arrive at.
 *
 * Warnings, never blocks: pricing a dish below cost can be a deliberate choice
 * (a loss leader, a staff meal), and it is the owner's to make. The job here is
 * that they make it knowingly.
 */
export function PriceHealthNote({
  price,
  cost,
  exactPrice,
  priceTouched,
  pricing,
  locale,
}: {
  /** The price as typed in the editor. */
  price: number;
  cost: number;
  /** The stored exact price, shown when the owner has not retyped the price. */
  exactPrice: number | null;
  priceTouched: boolean;
  pricing: MenuPricing;
  locale: Locale;
}) {
  const { t } = useI18n();
  const c = t.costing;

  if (!(price > 0)) return null;

  const shown = roundMenuPrice(price, pricing.step);
  const health = priceHealth({
    price: shown,
    cost,
    lowMarginPercent: pricing.lowMarginPercent,
  });

  // The exact figure behind an untouched price — e.g. 251,035 shown as
  // 250,000 after an ingredient increase — so the owner knows the menu price
  // is rounded from something, and what.
  const exactNote =
    !priceTouched && exactPrice !== null && Math.round(exactPrice) !== shown
      ? c.exactPrice.replace(
          "{price}",
          formatMoneyWithUnit(Math.round(exactPrice), locale),
        )
      : null;

  // A typed price that is not on the venue's step will be shown rounded.
  const shownNote =
    shown !== price
      ? c.shownAs.replace("{price}", formatMoneyWithUnit(shown, locale))
      : null;

  return (
    <div className="mt-3 space-y-2">
      {(exactNote || shownNote) && (
        <p className="text-xs text-ink-500 tabular-nums">
          {[shownNote, exactNote].filter(Boolean).join(" · ")}
        </p>
      )}

      {health.warning === "BELOW_COST" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-red-50 p-3 text-xs font-bold text-red-800 ring-1 ring-red-200"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {c.belowCost.replace("{cost}", formatMoneyWithUnit(cost, locale))}
        </p>
      )}

      {health.warning === "LOW_MARGIN" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-xs font-bold text-amber-800 ring-1 ring-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {c.lowMarginWarn
            .replace("{margin}", formatNumber(health.marginPercent ?? 0, locale))
            .replace("{floor}", formatNumber(pricing.lowMarginPercent, locale))}
        </p>
      )}

      {health.warning === null && cost > 0 && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 rounded-[var(--radius-sm)] bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <span>
            {t.menuBuilder.profitPreview}: {formatMoney(shown - cost, locale)}{" "}
            {t.common.toman}
          </span>
          <span>
            {t.menuBuilder.marginPreview}: {formatPercent((shown - cost) / shown, locale)}
          </span>
        </p>
      )}
    </div>
  );
}
