"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney, parseAmount } from "@/lib/format";
import { MAX_BUNDLE_COMPONENTS, componentsTotal } from "@/lib/bundles";
import type { Locale } from "@/lib/i18n";
import type { ProductRow } from "./builder";

/**
 * "This is a meal deal, and here is what is in it."
 *
 * Lives inside the product dialog beside the pairings editor, because a bundle
 * *is* a product: the owner sets its price, photo and description in the fields
 * above, and this only says what it contains. There is no separate bundle
 * screen because there is no separate bundle entity — see src/lib/bundles.ts.
 *
 * The saving is shown live as the owner builds it. That is the whole feedback
 * loop this editor needs: a combo priced above its parts is a decision an owner
 * is allowed to make, but it should not be one they make by accident.
 */

/** One row of the editor; matches the API's bundle shape exactly. */
export interface BundleItemRow {
  componentProductId: string;
  quantity: number;
}

export function BundleEditor({
  rows,
  onRowsChange,
  allProducts,
  /** The dish being edited: it cannot contain itself, and it is what is priced. */
  currentProductId,
  price,
  locale,
}: {
  rows: BundleItemRow[];
  onRowsChange: (rows: BundleItemRow[]) => void;
  allProducts: ProductRow[];
  currentProductId: string | null;
  /** The bundle's own price, for the live saving figure. */
  price: number;
  locale: Locale;
}) {
  const { t } = useI18n();
  const b = t.bundles;

  const chosen = new Set(rows.map((row) => row.componentProductId));
  const candidates = allProducts.filter((product) => product.id !== currentProductId);
  const available = candidates.filter((product) => !chosen.has(product.id));

  const priceOf = React.useCallback(
    (id: string) => allProducts.find((p) => p.id === id)?.price ?? null,
    [allProducts],
  );

  /**
   * What the parts cost, and therefore what the deal saves.
   *
   * Uses the same pure function the public menu does, so the number an owner
   * sees here is arithmetically the number a guest will see — not a second
   * implementation that could round differently.
   */
  const total = React.useMemo(
    () =>
      componentsTotal(
        rows.map((row) => ({
          productId: row.componentProductId,
          quantity: row.quantity,
        })),
        priceOf,
      ),
    [rows, priceOf],
  );

  const saving = total === null ? null : total - price;

  function update(index: number, patch: Partial<BundleItemRow>) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const next = available[0];
    if (!next) return;
    onRowsChange([...rows, { componentProductId: next.id, quantity: 1 }]);
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3.5">
      <div>
        <p className="text-sm font-semibold text-ink-800">{b.title}</p>
        <p className="mt-0.5 text-xs text-ink-500">{b.hint}</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-ink-500">{b.emptyHint}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {rows.map((row, index) => {
            const product = allProducts.find((p) => p.id === row.componentProductId);

            return (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={b.product}
                  className="h-10 w-auto min-w-40 flex-1"
                  value={row.componentProductId}
                  onChange={(e) => update(index, { componentProductId: e.target.value })}
                >
                  {/* The current value stays listed even though it is taken, or
                      the select would show something the owner did not choose. */}
                  {product && <option value={product.id}>{product.name}</option>}
                  {available.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </Select>

                {/*
                  Quantity goes through `parseAmount`, which normalises Persian
                  digits — `Number("۲")` is NaN, and an owner typing on a
                  Persian keyboard is the normal case, not the edge one. Bounded
                  to match the server schema so the two cannot disagree.
                */}
                <Input
                  aria-label={b.quantity}
                  className="h-10 w-16 text-center"
                  inputMode="numeric"
                  dir="ltr"
                  value={String(row.quantity)}
                  onChange={(e) =>
                    update(index, {
                      quantity: Math.min(
                        20,
                        Math.max(1, parseAmount(e.target.value) || 1),
                      ),
                    })
                  }
                />

                {product && (
                  <span className="text-xs text-ink-500 tabular-nums">
                    {formatMoney(product.price * row.quantity, locale)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
                  aria-label={`${b.remove} — ${product?.name ?? ""}`}
                  className="tap-safe grid size-9 place-items-center rounded-[var(--radius-xs)] text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRow}
          disabled={available.length === 0 || rows.length >= MAX_BUNDLE_COMPONENTS}
        >
          <Plus className="size-4" />
          {b.add}
        </Button>
      </div>

      {/*
        The live saving.

        Stated plainly and without alarm when the deal saves nothing: a venue
        may legitimately sell convenience rather than a discount. What it must
        not do is silently look like a discount when it is not one.
      */}
      {rows.length > 0 && total !== null && (
        <div className="mt-3 border-t border-ink-200 pt-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink-500">{b.partsTotal}</span>
            <span className="font-semibold text-ink-800 tabular-nums">
              {formatMoney(total, locale)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink-500">{b.saving}</span>
            <span
              className={
                saving !== null && saving > 0
                  ? "font-semibold text-emerald-700 tabular-nums"
                  : "font-semibold text-ink-500 tabular-nums"
              }
            >
              {saving !== null && saving > 0 ? formatMoney(saving, locale) : b.noSaving}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rows as the API wants them; position carries the order. */
export function bundleItemsToPayload(rows: BundleItemRow[]) {
  return rows.map((row) => ({
    componentProductId: row.componentProductId,
    quantity: row.quantity,
  }));
}

/** Stored contents as editor rows, preserving the server's ordering. */
export function bundleItemsToRows(
  stored: readonly { componentProductId: string; quantity: number }[],
): BundleItemRow[] {
  return stored.map((item) => ({
    componentProductId: item.componentProductId,
    quantity: item.quantity,
  }));
}
