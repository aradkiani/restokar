"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuantityLabel } from "./shared";

export interface StockViewRow {
  itemId: string;
  name: string;
  unit: string;
  categoryName: string | null;
  supplierName: string | null;
  isActive: boolean;
  quantityMilli: number;
  unitCost: number | null;
  value: number;
  isLow: boolean;
  isNegative: boolean;
}

/**
 * What one site holds, item by item.
 *
 * Problems first: below zero, then running low, then everything else in the
 * catalogue's order — the list exists to say what needs doing.
 */
export function StockView({ rows }: { rows: StockViewRow[] }) {
  const { t, locale } = useI18n();
  const quantity = useQuantityLabel();
  const [query, setQuery] = React.useState("");

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (row: StockViewRow) =>
      !row.isActive ? 3 : row.isNegative ? 0 : row.isLow ? 1 : 2;
    return rows
      .filter(
        (row) =>
          !q ||
          row.name.toLowerCase().includes(q) ||
          (row.categoryName ?? "").toLowerCase().includes(q),
      )
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
      .map(({ row }) => row);
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.stock.search}
          aria-label={t.stock.search}
          className="ps-9"
        />
      </div>

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-surface">
        {visible.map((row) => (
          <li
            key={row.itemId}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-3",
              !row.isActive && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">
                {row.name}
                {!row.isActive && (
                  <span className="ms-2 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-600">
                    {t.stock.archived}
                  </span>
                )}
              </p>
              {(row.categoryName || row.supplierName) && (
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {[row.categoryName, row.supplierName].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="shrink-0 text-end">
              <p
                className={cn(
                  "text-sm font-black tabular-nums",
                  row.isNegative
                    ? "text-red-700"
                    : row.isLow
                      ? "text-orange-700"
                      : "text-ink-900",
                )}
              >
                <bdi>{quantity(row.quantityMilli, row.unit)}</bdi>
                {(row.isNegative || row.isLow) && (
                  <span
                    className={cn(
                      "ms-2 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                      row.isNegative
                        ? "bg-red-100 text-red-800"
                        : "bg-orange-100 text-orange-800",
                    )}
                  >
                    {row.isNegative ? t.stock.negative : t.stock.low}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-500 tabular-nums">
                {row.unitCost === null
                  ? t.stock.noCost
                  : `${formatMoney(row.value, locale)} ${t.common.toman}`}
              </p>
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-ink-500">{t.common.empty}</li>
        )}
      </ul>
    </div>
  );
}
