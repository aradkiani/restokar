"use client";

import { Badge } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

export interface ProfitRow {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  unitProfit: number;
  margin: number;
  quantitySold: number;
  totalProfit: number;
  realisedUnitProfit: number | null;
  hasCost: boolean;
}

/** Per-product unit economics. Doubles as the table view for the charts above. */
export function ProfitTable({ rows, locale }: { rows: ProfitRow[]; locale: Locale }) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return <p className="p-8 text-center text-sm text-ink-500">{t.analytics.noData}</p>;
  }

  return (
    // min-w-0 stops this container inheriting the table's intrinsic width from
    // a flex/grid parent, which is what makes the internal scroll actually work.
    <div className="max-h-[420px] min-w-0 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-ink-200 text-xs text-ink-500">
            <th className="p-3 text-start font-semibold">{t.menuBuilder.productName}</th>
            <th className="p-3 text-start font-semibold">{t.finance.unitProfit}</th>
            {/* Margin and units sold are derivable context, not the headline.
                On a phone they cost more than they inform, so the two columns
                that answer "is this product making me money?" get the width. */}
            <th className="hidden p-3 text-start font-semibold sm:table-cell">
              {t.finance.margin}
            </th>
            <th className="hidden p-3 text-start font-semibold sm:table-cell">
              {t.finance.sold}
            </th>
            <th className="p-3 text-start font-semibold">
              {t.finance.profitContribution}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-ink-50">
              <td className="p-3">
                <span className="block font-semibold text-ink-900">{row.name}</span>
                {!row.hasCost && (
                  <Badge tone="warning" className="mt-1">
                    {t.finance.missingCost}
                  </Badge>
                )}
              </td>
              <td className="p-3 font-semibold tabular-nums">
                {row.hasCost ? formatMoney(row.unitProfit, locale) : "—"}
                {/* The hidden columns' data folds under the profit figure so
                    nothing is actually lost at narrow widths. */}
                <span className="mt-0.5 block text-xs font-normal text-ink-500 sm:hidden">
                  {row.hasCost ? formatPercent(row.margin, locale) : "—"} ·{" "}
                  {formatNumber(row.quantitySold, locale)} {t.analytics.units}
                </span>
              </td>
              <td className="hidden p-3 tabular-nums sm:table-cell">
                {row.hasCost ? formatPercent(row.margin, locale) : "—"}
              </td>
              <td className="hidden p-3 tabular-nums sm:table-cell">
                {formatNumber(row.quantitySold, locale)}
              </td>
              <td
                className={`p-3 font-bold tabular-nums ${
                  row.totalProfit >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {formatMoney(row.totalProfit, locale)}
                {/* Today's price minus today's cost can differ from what the
                    sales actually earned; both are shown so neither misleads. */}
                {row.realisedUnitProfit !== null && (
                  <span className="mt-0.5 block text-xs font-normal text-ink-500">
                    {t.finance.realisedPerUnit.replace(
                      "{amount}",
                      formatMoney(row.realisedUnitProfit, locale),
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
