"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatDate, formatMoney, localizeDigits } from "@/lib/format";
import { fromMilli, parseQuantity } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import {
  UnitPicker,
  dayToInstant,
  todayInput,
  useQuantityLabel,
  type StockItemOption,
} from "./shared";

interface Line {
  key: number;
  itemId: string;
  amount: string;
  unit: string;
  lineTotal: number | null;
}

export interface PurchaseRow {
  id: string;
  purchasedAt: string;
  invoiceNumber: string | null;
  total: number;
  paid: boolean;
  note: string | null;
  createdByLabel: string;
  supplierName: string | null;
  lines: { name: string; itemUnit: string; quantityMilli: number; lineTotal: number }[];
}

/*
  Line keys start from 0 on every render of a fresh form, so the server and the
  browser agree on the first line's ids; a module-level counter did not, and
  every visit logged a hydration mismatch.
*/
const blankLine = (key: number): Line => ({
  key,
  itemId: "",
  amount: "",
  unit: "",
  lineTotal: null,
});

/**
 * Booking an invoice in: supplier, date, and one line per item.
 *
 * Each line takes the amount in whatever unit the invoice uses — a 10 kg sack
 * of a gram-counted spice is typed as 10 kg — and the line's total, which is
 * what the invoice actually prints. The per-unit price is derived on the
 * server, never typed.
 */
export function PurchaseForm({
  siteId,
  items,
  suppliers,
}: {
  siteId: string;
  items: StockItemOption[];
  suppliers: { id: string; name: string; isActive: boolean }[];
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const copy = t.stock;
  const active = items.filter((item) => item.isActive);
  const byId = new Map(items.map((item) => [item.id, item]));

  const [supplierId, setSupplierId] = React.useState("");
  const [day, setDay] = React.useState(todayInput);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [paid, setPaid] = React.useState(true);
  const [updateReference, setUpdateReference] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>(() => [blankLine(0)]);
  const lastKey = React.useRef(0);
  const newLine = () => blankLine(++lastKey.current);
  const [busy, setBusy] = React.useState(false);

  const total = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const ready = lines.some(
    (line) => line.itemId && parseQuantity(line.amount) > 0 && line.lineTotal !== null,
  );

  function patch(key: number, change: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const filled = lines.filter(
      (line) => line.itemId && parseQuantity(line.amount) > 0 && line.lineTotal !== null,
    );
    if (filled.length === 0) return;
    setBusy(true);
    const result = await api.post("/api/inventory/purchases", {
      siteId,
      supplierId: supplierId || null,
      purchasedAt: dayToInstant(day),
      invoiceNumber: invoiceNumber.trim() || undefined,
      paid,
      note: note.trim() || undefined,
      updateReferencePrices: updateReference,
      lines: filled.map((line) => ({
        itemId: line.itemId,
        amount: fromMilli(parseQuantity(line.amount)),
        unit: line.unit || byId.get(line.itemId)?.unit,
        lineTotal: line.lineTotal ?? 0,
      })),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(copy.purchaseSaved);
    setLines([newLine()]);
    setInvoiceNumber("");
    setNote("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.newPurchase}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4" aria-label={copy.newPurchase}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={copy.supplier} htmlFor="pu-supplier">
              <Select
                id="pu-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">{copy.noSupplier}</option>
                {suppliers
                  .filter((s) => s.isActive || s.id === supplierId)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label={copy.purchaseDate}
              hint={day ? formatDate(`${day}T12:00:00+03:30`, locale) : undefined}
              htmlFor="pu-date"
            >
              <Input
                id="pu-date"
                type="date"
                dir="ltr"
                required
                max={todayInput()}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </Field>
            <Field
              label={copy.invoiceNumber}
              hint={t.common.optional}
              htmlFor="pu-invoice"
            >
              <Input
                id="pu-invoice"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                maxLength={40}
              />
            </Field>
          </div>

          <ul className="space-y-3">
            {lines.map((line, index) => {
              const item = byId.get(line.itemId);
              return (
                <li
                  key={line.key}
                  className="grid grid-cols-2 gap-2 rounded-[var(--radius-sm)] border border-ink-200 p-3 sm:grid-cols-[2fr_1fr_1fr_1.4fr_auto] sm:items-end"
                >
                  <Field
                    label={copy.item}
                    htmlFor={`pu-item-${line.key}`}
                    className="col-span-2 sm:col-span-1"
                  >
                    <Select
                      id={`pu-item-${line.key}`}
                      value={line.itemId}
                      onChange={(e) => {
                        const chosen = byId.get(e.target.value);
                        patch(line.key, {
                          itemId: e.target.value,
                          unit: chosen?.unit ?? "",
                        });
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
                  <Field label={copy.amount} htmlFor={`pu-amount-${line.key}`}>
                    <Input
                      id={`pu-amount-${line.key}`}
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => patch(line.key, { amount: e.target.value })}
                    />
                  </Field>
                  <Field label={copy.unit} htmlFor={`pu-unit-${line.key}`}>
                    {item ? (
                      <UnitPicker
                        id={`pu-unit-${line.key}`}
                        itemUnit={item.unit}
                        value={line.unit || item.unit}
                        onChange={(unit) => patch(line.key, { unit })}
                      />
                    ) : (
                      <Input id={`pu-unit-${line.key}`} disabled value="" />
                    )}
                  </Field>
                  <Field
                    label={copy.lineTotal}
                    htmlFor={`pu-total-${line.key}`}
                    className="col-span-2 sm:col-span-1"
                  >
                    <MoneyInput
                      id={`pu-total-${line.key}`}
                      value={line.lineTotal}
                      onValueChange={(value) => patch(line.key, { lineTotal: value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${copy.removeLine} ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((l) => l.key !== line.key))
                    }
                    className="col-span-2 justify-self-end sm:col-span-1"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, newLine()])}
            disabled={lines.length >= 60}
          >
            <Plus className="size-4" />
            {copy.addLine}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              checked={paid}
              onChange={setPaid}
              label={paid ? copy.paid : copy.unpaidLabel}
            />
            <Toggle
              checked={updateReference}
              onChange={setUpdateReference}
              label={copy.updateReference}
              description={copy.updateReferenceHint}
            />
          </div>

          <Field label={copy.note} hint={t.common.optional} htmlFor="pu-note">
            <Textarea
              id="pu-note"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <p className="text-sm font-bold text-ink-700">
              {copy.total}:{" "}
              <span className="text-lg font-black text-ink-900 tabular-nums">
                {formatMoney(total, locale)}
              </span>{" "}
              {t.common.toman}
            </p>
            <Button type="submit" loading={busy} disabled={!ready}>
              {copy.newPurchase}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Recent invoices, with the unpaid ones settleable in one tap. */
export function PurchaseList({ siteId, rows }: { siteId: string; rows: PurchaseRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const quantity = useQuantityLabel();
  const copy = t.stock;
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function markPaid(id: string) {
    setBusyId(id);
    const result = await api.patch(`/api/inventory/purchases/${id}`, {
      paid: true,
      siteId,
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.recentPurchases}</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">{copy.noPurchases}</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.id} className="space-y-1.5 px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-ink-900">
                    {row.supplierName ?? copy.noSupplier}
                    {row.invoiceNumber && (
                      <span className="ms-2 text-xs font-semibold text-ink-500">
                        #{localizeDigits(row.invoiceNumber, locale)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-black text-ink-900 tabular-nums">
                    {formatMoney(row.total, locale)} {t.common.toman}
                  </p>
                </div>
                <p className="text-xs text-ink-500">
                  {formatDate(row.purchasedAt, locale)} ·{" "}
                  {copy.by.replace("{name}", row.createdByLabel)}
                </p>
                <p className="text-xs text-ink-600">
                  {row.lines
                    .map(
                      (line) =>
                        `${line.name} ${quantity(line.quantityMilli, line.itemUnit)}`,
                    )
                    .join("، ")}
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                      row.paid
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-orange-100 text-orange-800",
                    )}
                  >
                    {row.paid ? copy.paid : copy.unpaidLabel}
                  </span>
                  {!row.paid && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyId === row.id}
                      onClick={() => markPaid(row.id)}
                    >
                      {copy.markPaid}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
