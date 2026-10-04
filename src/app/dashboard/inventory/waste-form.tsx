"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatDateTime, formatMoney } from "@/lib/format";
import { fromMilli, parseQuantity } from "@/lib/inventory";
import { WASTE_REASONS, type WasteReason } from "@/lib/inventory-ledger";
import { UnitPicker, useQuantityLabel, type StockItemOption } from "./shared";

export interface WasteRow {
  id: string;
  createdAt: string;
  itemName: string;
  unit: string;
  deltaMilli: number;
  value: number;
  wasteReason: string | null;
  note: string | null;
  actorLabel: string | null;
}

/** Throwing stock away, with the reason, at the site's average cost. */
export function WasteForm({
  siteId,
  items,
}: {
  siteId: string;
  items: StockItemOption[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const copy = t.stock;
  const active = items.filter((item) => item.isActive);
  const byId = new Map(items.map((item) => [item.id, item]));

  const [itemId, setItemId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [reason, setReason] = React.useState<WasteReason>("spoiled");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const item = byId.get(itemId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!item || parseQuantity(amount) <= 0) return;
    setBusy(true);
    const result = await api.post("/api/inventory/waste", {
      siteId,
      itemId,
      amount: fromMilli(parseQuantity(amount)),
      unit: unit || item.unit,
      reason,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(copy.wasteSaved);
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.recordWaste}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4" aria-label={copy.recordWaste}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1.5fr]">
            <Field label={copy.item} htmlFor="w-item">
              <Select
                id="w-item"
                required
                value={itemId}
                onChange={(e) => {
                  setItemId(e.target.value);
                  setUnit(byId.get(e.target.value)?.unit ?? "");
                }}
              >
                <option value="">{copy.chooseItem}</option>
                {active.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={copy.amount} htmlFor="w-amount">
              <Input
                id="w-amount"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label={copy.unit} htmlFor="w-unit">
              {item ? (
                <UnitPicker
                  id="w-unit"
                  itemUnit={item.unit}
                  value={unit || item.unit}
                  onChange={setUnit}
                />
              ) : (
                <Input id="w-unit" disabled value="" />
              )}
            </Field>
            <Field label={copy.reason} htmlFor="w-reason">
              <Select
                id="w-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as WasteReason)}
              >
                {WASTE_REASONS.map((key) => (
                  <option key={key} value={key}>
                    {copy.wasteReasons[key]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={copy.note} hint={t.common.optional} htmlFor="w-note">
            <Textarea
              id="w-note"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={busy}
              disabled={!item || parseQuantity(amount) <= 0}
            >
              {copy.recordWaste}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function WasteList({ rows }: { rows: WasteRow[] }) {
  const { t, locale } = useI18n();
  const quantity = useQuantityLabel();
  const copy = t.stock;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.recentWaste}</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">{copy.noWaste}</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-900">
                    {row.itemName}{" "}
                    <bdi className="font-semibold text-ink-600">
                      {quantity(-row.deltaMilli, row.unit)}
                    </bdi>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {row.wasteReason
                      ? (copy.wasteReasons[row.wasteReason as WasteReason] ??
                        row.wasteReason)
                      : ""}
                    {row.note ? ` — ${row.note}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {formatDateTime(row.createdAt, locale)}
                    {row.actorLabel ? ` · ${row.actorLabel}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-red-700 tabular-nums">
                  {formatMoney(-row.value, locale)} {t.common.toman}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
