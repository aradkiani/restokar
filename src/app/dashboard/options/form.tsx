"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Toggle } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoneyWithUnit, localizeDigits, parseAmount } from "@/lib/format";
import { calculatePrice } from "@/lib/pricing";
import { ROUNDING_INCREMENTS } from "@/lib/validation";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TranslationStatus } from "@/lib/translation-status";

export interface OptionsValues {
  taxEnabled: boolean;
  taxPercent: number;
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
  tipEnabled: boolean;
  tipPercents: number[];
  roundingIncrement: number;
  roundingDirection: "up" | "down" | "nearest";
  minimumOrderAmount: number;
  staffCallEnabled: boolean;
  staffCallLabel: string;
  staffCallLabelEn: string;
  bilingualEnabled: boolean;
  phoneCollectionEnabled: boolean;
}

/** A round, plausible basket for the live preview. */
const SAMPLE_BASKET = 237_000;

export function OptionsForm({
  initial,
  translation,
}: {
  initial: OptionsValues;
  translation: TranslationStatus;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = React.useState(initial);
  const [tipInput, setTipInput] = React.useState(initial.tipPercents.join("،"));
  const [saving, setSaving] = React.useState(false);

  function setField<K extends keyof OptionsValues>(key: K, value: OptionsValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Accepts Persian or Latin digits and either separator, so an owner typing
   * "۵،۱۰،۱۵" gets the same result as "5,10,15".
   */
  const parsedTips = React.useMemo(
    () =>
      tipInput
        .split(/[,،\s]+/)
        .map((part) => parseAmount(part))
        .filter((value) => value > 0 && value <= 100)
        .slice(0, 4),
    [tipInput],
  );

  // Runs the same function the server uses, so what the owner previews here is
  // exactly what a guest will be charged.
  const preview = React.useMemo(() => calculatePrice(SAMPLE_BASKET, form), [form]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const result = await api.patch("/api/settings/options", {
      ...form,
      tipPercents: parsedTips.length > 0 ? parsedTips : [10],
    });

    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    toast.success(t.options.saved);
    router.refresh();
  }

  const money = (value: number) => formatMoneyWithUnit(value, locale);

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.options.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.options.subtitle}</p>
      </header>

      {/* ------------------------------------------------------------ tax */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.taxTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.taxHint}</p>
          <Toggle
            checked={form.taxEnabled}
            onChange={(v) => setField("taxEnabled", v)}
            label={t.options.taxEnable}
          />
          {form.taxEnabled && (
            <Field label={t.options.taxPercent} htmlFor="tax-percent">
              <Input
                id="tax-percent"
                inputMode="numeric"
                value={localizeDigits(form.taxPercent, locale)}
                onChange={(e) => setField("taxPercent", parseAmount(e.target.value))}
              />
            </Field>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------- service charge */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.serviceTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.serviceHint}</p>
          <Toggle
            checked={form.serviceChargeEnabled}
            onChange={(v) => setField("serviceChargeEnabled", v)}
            label={t.options.serviceEnable}
          />
          {form.serviceChargeEnabled && (
            <Field label={t.options.servicePercent} htmlFor="service-percent">
              <Input
                id="service-percent"
                inputMode="numeric"
                value={localizeDigits(form.serviceChargePercent, locale)}
                onChange={(e) =>
                  setField("serviceChargePercent", parseAmount(e.target.value))
                }
              />
            </Field>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- rounding */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.roundingTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.roundingHint}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.options.roundingIncrement} htmlFor="rounding-increment">
              <Select
                id="rounding-increment"
                value={String(form.roundingIncrement)}
                onChange={(e) => setField("roundingIncrement", Number(e.target.value))}
              >
                {ROUNDING_INCREMENTS.map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? t.options.roundingOff : money(value)}
                  </option>
                ))}
              </Select>
            </Field>

            {form.roundingIncrement > 0 && (
              <Field label={t.options.roundingDirection} htmlFor="rounding-direction">
                <Select
                  id="rounding-direction"
                  value={form.roundingDirection}
                  onChange={(e) =>
                    setField(
                      "roundingDirection",
                      e.target.value as OptionsValues["roundingDirection"],
                    )
                  }
                >
                  <option value="nearest">{t.options.roundNearest}</option>
                  <option value="up">{t.options.roundUp}</option>
                  <option value="down">{t.options.roundDown}</option>
                </Select>
              </Field>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------ tip */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.tipTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.tipHint}</p>
          <Toggle
            checked={form.tipEnabled}
            onChange={(v) => setField("tipEnabled", v)}
            label={t.options.tipEnable}
          />
          {form.tipEnabled && (
            <Field
              label={t.options.tipPercents}
              hint={t.options.tipPercentsHint}
              htmlFor="tip-percents"
            >
              <Input
                id="tip-percents"
                value={tipInput}
                onChange={(e) => setTipInput(e.target.value)}
              />
            </Field>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------------- minimum */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.minimumTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.minimumHint}</p>
          <Field label={t.options.minimumAmount} htmlFor="minimum-amount">
            <MoneyInput
              id="minimum-amount"
              value={form.minimumOrderAmount}
              onValueChange={(amount) => setField("minimumOrderAmount", amount ?? 0)}
            />
          </Field>
        </CardBody>
      </Card>

      {/* ------------------------------------------- guest phone number */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.phoneCollectionTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">
            {t.options.phoneCollectionHint}
          </p>
          <Toggle
            checked={form.phoneCollectionEnabled}
            onChange={(v) => setField("phoneCollectionEnabled", v)}
            label={t.options.phoneCollectionEnable}
            description={t.options.phoneCollectionDescription}
          />
        </CardBody>
      </Card>

      {/* ----------------------------------------------------- staff call */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.staffCallTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.staffCallHint}</p>
          <Toggle
            checked={form.staffCallEnabled}
            onChange={(v) => setField("staffCallEnabled", v)}
            label={t.options.staffCallEnable}
          />
          {form.staffCallEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t.options.staffCallLabel}
                hint={t.options.staffCallLabelHint}
                htmlFor="staff-call-label"
              >
                <Input
                  id="staff-call-label"
                  value={form.staffCallLabel}
                  maxLength={40}
                  onChange={(e) => setField("staffCallLabel", e.target.value)}
                />
              </Field>

              {form.bilingualEnabled && (
                <Field
                  label={t.options.staffCallLabelEn}
                  hint={t.common.optional}
                  htmlFor="staff-call-label-en"
                >
                  <Input
                    id="staff-call-label-en"
                    dir="ltr"
                    value={form.staffCallLabelEn}
                    maxLength={40}
                    onChange={(e) => setField("staffCallLabelEn", e.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------ language */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.bilingualTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs leading-6 text-ink-500">{t.options.bilingualHint}</p>
          <Toggle
            checked={form.bilingualEnabled}
            onChange={(v) => setField("bilingualEnabled", v)}
            label={t.options.bilingualEnable}
            description={
              form.bilingualEnabled ? t.options.bilingualOn : t.options.bilingualOff
            }
          />

          {form.bilingualEnabled && (
            <div className="rounded-[var(--radius-sm)] bg-ink-50 p-3">
              <p className="text-xs font-bold text-ink-700">
                {t.options.bilingualCoverage}
              </p>

              {translation.complete ? (
                <p className="mt-1.5 text-xs text-accent-700">
                  {t.options.bilingualComplete}
                </p>
              ) : (
                <>
                  {/* Two counts side by side would read as one long number in
                      RTL, so each is its own row with a real label. */}
                  <dl className="mt-2 space-y-1 text-xs text-ink-600">
                    <CoverageRow
                      label={t.dashboard.products}
                      translated={translation.products.translated}
                      total={translation.products.total}
                      locale={locale}
                    />
                    <CoverageRow
                      label={t.dashboard.categories}
                      translated={translation.categories.translated}
                      total={translation.categories.total}
                      locale={locale}
                    />
                  </dl>
                  <p className="mt-2 text-xs leading-6 text-ink-500">
                    {t.options.bilingualIncomplete}
                  </p>
                </>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------------- preview */}
      <Card>
        <CardHeader>
          <CardTitle>{t.options.previewTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-xs leading-6 text-ink-500">{t.options.previewHint}</p>
          <dl className="space-y-1.5 rounded-[var(--radius-sm)] bg-ink-50 p-3 text-sm">
            <PreviewRow
              label={t.options.previewSubtotal}
              value={money(preview.subtotal)}
            />
            {preview.serviceCharge > 0 && (
              <PreviewRow
                label={t.options.previewService}
                value={money(preview.serviceCharge)}
              />
            )}
            {preview.tax > 0 && (
              <PreviewRow label={t.options.previewTax} value={money(preview.tax)} />
            )}
            {preview.roundingAdjustment !== 0 && (
              <PreviewRow
                label={t.options.previewRounding}
                value={money(preview.roundingAdjustment)}
              />
            )}
            <div className="border-t border-ink-200 pt-1.5">
              <PreviewRow
                label={t.options.previewTotal}
                value={money(preview.total)}
                emphasis
              />
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t.common.saving : t.common.save}
        </Button>
      </div>
    </form>
  );
}

/**
 * "۱۲ از ۴۰" — the two figures are wrapped in <bdi> and separated by a real
 * word, because adjacent digit runs in RTL otherwise read as one long number.
 */
function CoverageRow({
  label,
  translated,
  total,
  locale,
}: {
  label: string;
  translated: number;
  total: number;
  locale: Locale;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="font-bold tabular-nums">
        <bdi>{formatNumber(translated, locale)}</bdi>
        <span className="mx-1.5 font-normal opacity-70">{t.common.of}</span>
        <bdi>{formatNumber(total, locale)}</bdi>
      </dd>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasis ? "font-bold text-ink-900" : "text-ink-600"}>{label}</dt>
      {/* Isolated so the amount cannot merge with the label's digits in RTL. */}
      <dd className={emphasis ? "font-black tabular-nums" : "text-ink-800 tabular-nums"}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
