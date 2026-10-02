"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select, Toggle } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber, parseAmount } from "@/lib/format";
import type { DiscountType } from "@/lib/discounts";

interface DiscountRow {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  isActive: boolean;
}

/**
 * Create, switch off and delete discount codes, plus the one toggle that
 * decides whether checkout asks for a code at all.
 *
 * The toggle is deliberately above the list rather than beside each code: it is
 * not a property of any one promotion, it is whether the field exists for
 * guests, and a venue between promotions turns it off without deleting
 * anything.
 */
export function DiscountsManager({
  enabledAtCheckout,
  showOrderDiscount,
  initialCodes,
}: {
  enabledAtCheckout: boolean;
  showOrderDiscount: boolean;
  initialCodes: DiscountRow[];
}) {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [enabled, setEnabled] = React.useState(enabledAtCheckout);
  const [showDiscount, setShowDiscount] = React.useState(showOrderDiscount);
  const [codes, setCodes] = React.useState<DiscountRow[]>(initialCodes);

  const [code, setCode] = React.useState("");
  const [type, setType] = React.useState<DiscountType>("PERCENT");
  const [value, setValue] = React.useState("");
  const [maxDiscount, setMaxDiscount] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function toggleCheckout(next: boolean) {
    // Optimistic: a toggle that waits on a round trip feels broken, and the
    // failure path puts it straight back.
    setEnabled(next);
    const result = await api.patch("/api/settings/options", {
      discountCodesEnabled: next,
    });
    if (!result.ok) {
      setEnabled(!next);
      toast.error(result.error.message);
    }
  }

  /** Display only: the amount is snapshotted onto the order either way. */
  async function toggleShowDiscount(next: boolean) {
    setShowDiscount(next);
    const result = await api.patch("/api/settings/options", {
      showOrderDiscount: next,
    });
    if (!result.ok) {
      setShowDiscount(!next);
      toast.error(result.error.message);
    }
  }

  async function createCode(event: React.FormEvent) {
    event.preventDefault();

    /*
      `parseAmount`, not `Number`.

      The panel is Persian and the placeholder is written in Persian digits, so
      that is what gets typed — and `Number("۱۵")` is NaN. The old guard then
      returned early without saying anything, so the button appeared to do
      nothing at all no matter what was entered. This also strips the «٬»
      thousands separator someone copies in with an amount.
    */
    const amount = parseAmount(value);
    const cap = maxDiscount.trim() ? parseAmount(maxDiscount) : null;

    if (!code.trim() || amount <= 0) {
      // Say so, rather than failing silently — that silence was the bug.
      toast.error(t.options.codeInvalid);
      return;
    }

    setBusy(true);
    const result = await api.post("/api/discounts", {
      code,
      type,
      value: amount,
      // A ceiling belongs to a percentage only; sending it with a fixed code
      // would be refused by the schema.
      maxDiscount: type === "PERCENT" && cap && cap > 0 ? cap : null,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    setCodes((current) => [result.data as DiscountRow, ...current]);
    setCode("");
    setValue("");
    setMaxDiscount("");
  }

  async function setActive(row: DiscountRow, isActive: boolean) {
    setCodes((current) => current.map((c) => (c.id === row.id ? { ...c, isActive } : c)));
    const result = await api.patch(`/api/discounts/${row.id}`, { isActive });
    if (!result.ok) {
      setCodes((current) =>
        current.map((c) => (c.id === row.id ? { ...c, isActive: !isActive } : c)),
      );
      toast.error(result.error.message);
    }
  }

  async function remove(row: DiscountRow) {
    if (!window.confirm(t.options.codeDeleteConfirm)) return;

    const result = await api.del(`/api/discounts/${row.id}`);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setCodes((current) => current.filter((c) => c.id !== row.id));
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t.options.discountsTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-6 text-ink-500">{t.options.discountsHint}</p>

          <Toggle
            checked={enabled}
            onChange={toggleCheckout}
            label={t.options.enableAtCheckout}
            description={t.options.enableAtCheckoutHint}
          />

          {/*
            Only meaningful once checkout actually asks for a code, so it is
            nested under the switch that decides that rather than sitting
            beside it offering to configure something that cannot happen.
          */}
          {enabled && (
            <Toggle
              checked={showDiscount}
              onChange={toggleShowDiscount}
              label={t.options.showOrderDiscount}
              description={t.options.showOrderDiscountHint}
            />
          )}

          <form onSubmit={createCode} className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label={t.options.codeLabel} htmlFor="discount-code">
              <input
                id="discount-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={24}
                // Codes are ASCII and read aloud; typing them in Persian
                // digits or lower case still matches, because the server
                // normalises before it looks anything up.
                dir="ltr"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-bold tracking-wider uppercase"
                placeholder="NOWRUZ"
              />
            </Field>

            <Field label={t.options.codeType} htmlFor="discount-type">
              <Select
                id="discount-type"
                value={type}
                onChange={(e) => setType(e.target.value as DiscountType)}
              >
                <option value="PERCENT">{t.options.codePercent}</option>
                <option value="FIXED">{t.options.codeFixed}</option>
              </Select>
            </Field>

            <Field label={t.options.codeValue} htmlFor="discount-value">
              {/* A fixed code is money and groups as it is typed; a percentage
                  is a small plain number. */}
              {type === "FIXED" ? (
                <MoneyInput
                  id="discount-value"
                  value={parseAmount(value) || null}
                  onValueChange={(amount) => setValue(amount ? String(amount) : "")}
                  className="font-bold"
                  placeholder="۵۰٬۰۰۰"
                />
              ) : (
                <input
                  id="discount-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-bold"
                  placeholder="۱۰"
                />
              )}
            </Field>

            {/*
              Only for a percentage. A fixed code is already a flat amount, so
              a ceiling on it would be a second way of writing the same number
              — and the schema refuses the combination rather than quietly
              storing a code that reads as two different offers.
            */}
            {type === "PERCENT" && (
              <Field
                label={t.options.codeMaxDiscount}
                hint={t.options.codeMaxHint}
                htmlFor="discount-max"
                className="sm:col-span-3"
              >
                <MoneyInput
                  id="discount-max"
                  value={parseAmount(maxDiscount) || null}
                  onValueChange={(amount) => setMaxDiscount(amount ? String(amount) : "")}
                  className="font-bold"
                  placeholder="۱۵۰٬۰۰۰"
                />
              </Field>
            )}

            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>
                <Plus className="size-4" />
                {t.options.codeCreate}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {codes.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-ink-500">
              {t.options.noCodes}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {codes.map((row) => (
                <li key={row.id} className="flex items-center gap-3 p-3">
                  <span
                    dir="ltr"
                    className={cn(
                      "font-mono text-sm font-black tracking-wider",
                      !row.isActive && "line-through opacity-50",
                    )}
                  >
                    {row.code}
                  </span>

                  <span className="flex-1 text-xs font-semibold text-ink-500">
                    {row.type === "PERCENT"
                      ? `${formatNumber(row.value, locale)}٪`
                      : formatMoney(row.value, locale)}
                    {/* A capped percentage is two facts, and the ceiling is
                        the one an owner forgets they set. */}
                    {row.type === "PERCENT" && row.maxDiscount ? (
                      <span className="text-ink-400">
                        {" · "}
                        {t.options.codeUpTo} {formatMoney(row.maxDiscount, locale)}
                      </span>
                    ) : null}
                  </span>

                  <button
                    type="button"
                    onClick={() => setActive(row, !row.isActive)}
                    className={cn(
                      "tap-safe min-h-11 rounded-full px-3 text-xs font-bold transition-colors",
                      row.isActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-ink-100 text-ink-500",
                    )}
                  >
                    {row.isActive ? t.options.codeActive : t.options.codeInactive}
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(row)}
                    aria-label={`${t.common.delete} ${row.code}`}
                    className="tap-safe grid size-11 place-items-center rounded-full text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
