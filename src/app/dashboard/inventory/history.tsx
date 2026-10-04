"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuantityLabel } from "./shared";

export interface MovementRow {
  id: string;
  createdAt: string;
  reason: string;
  itemId: string;
  itemName: string;
  unit: string;
  deltaMilli: number;
  value: number;
  actorLabel: string | null;
  note: string | null;
  wasteReason: string | null;
  orderNumber: number | null;
}

const REASONS = [
  "ORDER_PLACED",
  "ORDER_CANCELED",
  "PURCHASE",
  "WASTE",
  "STOCKTAKE",
  "MANUAL_ADJUSTMENT",
  "OPENING",
] as const;

/** Every change to this site's shelves, newest first, filterable, a page at a time. */
export function History({
  siteId,
  items,
  initialRows,
  pageSize,
}: {
  siteId: string;
  items: { id: string; name: string }[];
  initialRows: MovementRow[];
  pageSize: number;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const quantity = useQuantityLabel();
  const copy = t.stock;

  const [itemId, setItemId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [rows, setRows] = React.useState(initialRows);
  const [more, setMore] = React.useState(initialRows.length >= pageSize);
  const [busy, setBusy] = React.useState(false);

  async function load(next: { itemId: string; reason: string }, after?: string) {
    setBusy(true);
    const params = new URLSearchParams({ site: siteId });
    if (next.itemId) params.set("item", next.itemId);
    if (next.reason) params.set("reason", next.reason);
    if (after) params.set("after", after);
    const result = await api.get<MovementRow[]>(`/api/inventory/movements?${params}`);
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    setRows((current) => (after ? [...current, ...result.data] : result.data));
    setMore(result.data.length >= pageSize);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label={copy.item}
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            void load({ itemId: e.target.value, reason });
          }}
        >
          <option value="">{copy.allItems}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={copy.reason}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            void load({ itemId, reason: e.target.value });
          }}
        >
          <option value="">{copy.allReasons}</option>
          {REASONS.map((key) => (
            <option key={key} value={key}>
              {copy.reasons[key]}
            </option>
          ))}
        </Select>
      </div>

      <ul
        className={cn(
          "divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-surface",
          busy && "opacity-60",
        )}
      >
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">{row.itemName}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {copy.reasons[row.reason as keyof typeof copy.reasons] ?? row.reason}
                {row.orderNumber !== null &&
                  ` · ${copy.orderRef.replace("{number}", formatNumber(row.orderNumber, locale))}`}
                {row.wasteReason &&
                  ` · ${copy.wasteReasons[row.wasteReason as keyof typeof copy.wasteReasons] ?? row.wasteReason}`}
                {row.note && ` · ${row.note}`}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-400">
                {formatDateTime(row.createdAt, locale)} · {row.actorLabel ?? copy.system}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p
                className={cn(
                  "text-sm font-black tabular-nums",
                  row.deltaMilli < 0 ? "text-red-700" : "text-emerald-700",
                )}
              >
                <bdi>
                  {row.deltaMilli > 0 ? "+" : "−"}
                  {quantity(Math.abs(row.deltaMilli), row.unit)}
                </bdi>
              </p>
              {row.value !== 0 && (
                <p className="mt-0.5 text-[11px] text-ink-500 tabular-nums">
                  {formatMoney(Math.abs(row.value), locale)} {t.common.toman}
                </p>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-ink-500">
            {copy.noMovements}
          </li>
        )}
      </ul>

      {more && rows.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            loading={busy}
            onClick={() => load({ itemId, reason }, rows[rows.length - 1]!.id)}
          >
            {copy.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}
