"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Toggle } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney } from "@/lib/format";
import {
  MAX_PUBLIC_RECOMMENDATIONS,
  type RecommendationEdge,
} from "@/lib/recommendations";
import { MAX_RECOMMENDATIONS_PER_PRODUCT } from "@/lib/validation";
import type { Locale } from "@/lib/i18n";
import type { ProductRow } from "./builder";

/**
 * "When someone orders this, suggest…" — the owner's side of upselling.
 *
 * Lives inside the product dialog rather than on a screen of its own, because
 * the thought "chips go with this burger" happens while editing the burger. A
 * separate configuration section would mean navigating away from the dish to
 * describe something about the dish.
 *
 * Rows are ordered by position, which is the same convention info sections and
 * option groups already use — there is no second reordering mechanism.
 */

/** One row of the editor; matches the API's recommendation shape exactly. */
export interface RecommendationRow {
  recommendedProductId: string;
  isActive: boolean;
}

export function RecommendationEditor({
  rows,
  onRowsChange,
  allProducts,
  /** The dish being edited, excluded from its own candidate list. */
  currentProductId,
  locale,
  pairingNote,
  onPairingNoteChange,
  pairingNoteEn,
  onPairingNoteEnChange,
}: {
  rows: RecommendationRow[];
  onRowsChange: (rows: RecommendationRow[]) => void;
  allProducts: ProductRow[];
  currentProductId: string | null;
  locale: Locale;
  /** The owner's own line introducing these pairings on the public menu. */
  pairingNote: string;
  onPairingNoteChange: (value: string) => void;
  /** Offered alongside, exactly like the other English fields in this dialog. */
  pairingNoteEn: string;
  onPairingNoteEnChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const r = t.recommendations;

  /**
   * What may still be picked.
   *
   * A dish cannot suggest itself, and cannot suggest the same dish twice. Both
   * are refused by the server and by the database as well; removing them from
   * the list is what stops an owner discovering that by hitting an error.
   */
  const chosen = new Set(rows.map((row) => row.recommendedProductId));

  const candidates = allProducts.filter((product) => product.id !== currentProductId);

  const available = candidates.filter((product) => !chosen.has(product.id));

  function update(index: number, patch: Partial<RecommendationRow>) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const next = available[0];
    if (!next) return;
    onRowsChange([...rows, { recommendedProductId: next.id, isActive: true }]);
  }

  /** How many of the configured rows a guest will actually be shown. */
  const activeCount = rows.filter((row) => row.isActive).length;

  return (
    <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3.5">
      <div>
        <p className="text-sm font-semibold text-ink-800">{r.title}</p>
        <p className="mt-0.5 text-xs text-ink-500">{r.hint}</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-ink-500">{r.emptyHint}</p>
      ) : (
        <>
          {/* Stated rather than left to be discovered: an owner who adds six
              suggestions should know only the first three are shown. */}
          {activeCount > MAX_PUBLIC_RECOMMENDATIONS && (
            <p className="mt-3 text-xs text-amber-700">
              {r.capNotice.replace("{n}", String(MAX_PUBLIC_RECOMMENDATIONS))}
            </p>
          )}

          <ul className="mt-2.5 space-y-2">
            {rows.map((row, index) => {
              const product = allProducts.find((p) => p.id === row.recommendedProductId);

              return (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <span className="w-5 shrink-0 text-xs text-ink-500 tabular-nums">
                    {index + 1}
                  </span>

                  <Select
                    aria-label={r.product}
                    className="h-10 w-auto min-w-40 flex-1"
                    value={row.recommendedProductId}
                    onChange={(e) =>
                      update(index, { recommendedProductId: e.target.value })
                    }
                  >
                    {/* The current value stays listed even though it is taken,
                        or the select would show something the owner did not
                        choose. */}
                    {product && <option value={product.id}>{product.name}</option>}
                    {available.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </Select>

                  {product && (
                    <span className="text-xs text-ink-500 tabular-nums">
                      {formatMoney(product.price, locale)}
                    </span>
                  )}

                  <Toggle
                    checked={row.isActive}
                    onChange={(v) => update(index, { isActive: v })}
                    label={r.active}
                  />

                  <button
                    type="button"
                    onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
                    aria-label={`${r.remove} — ${product?.name ?? ""}`}
                    className="tap-safe grid size-9 place-items-center rounded-[var(--radius-xs)] text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRow}
          disabled={
            available.length === 0 || rows.length >= MAX_RECOMMENDATIONS_PER_PRODUCT
          }
        >
          <Plus className="size-4" />
          {r.add}
        </Button>
      </div>

      {/*
        The sentence a guest reads above these dishes.

        Only worth asking for once there is something to introduce, so it
        appears with the first pairing rather than sitting empty on every
        product. Left blank, the menu uses the platform's generic phrase — the
        placeholder shows exactly what that is, so an owner can see what they
        are replacing before they replace it.
      */}
      {rows.length > 0 && (
        <div className="mt-4 border-t border-ink-200 pt-3">
          <Field label={r.noteLabel} htmlFor="rec-note" hint={r.noteHint}>
            <Input
              id="rec-note"
              value={pairingNote}
              maxLength={90}
              onChange={(e) => onPairingNoteChange(e.target.value)}
              placeholder={t.publicMenu.pairingsFallback}
            />
          </Field>

          <div className="mt-2.5">
            <Field label={r.noteLabelEn} hint={t.common.optional} htmlFor="rec-note-en">
              <Input
                id="rec-note-en"
                value={pairingNoteEn}
                maxLength={90}
                dir="ltr"
                onChange={(e) => onPairingNoteEnChange(e.target.value)}
                placeholder="These go well with it"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rows as the API wants them; position carries the order. */
export function recommendationsToPayload(rows: RecommendationRow[]) {
  return rows.map((row) => ({
    recommendedProductId: row.recommendedProductId,
    isActive: row.isActive,
  }));
}

/** Stored edges as editor rows, preserving the server's ordering. */
export function recommendationsToRows(
  stored: readonly { recommendedProductId: string; isActive: boolean }[],
): RecommendationRow[] {
  return stored.map((edge) => ({
    recommendedProductId: edge.recommendedProductId,
    isActive: edge.isActive,
  }));
}

export type { RecommendationEdge };
