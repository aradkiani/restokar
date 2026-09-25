"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Toggle } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoneyWithUnit, formatNumber, parseAmount } from "@/lib/format";
import { PRICE_ROUNDING_STEPS } from "@/lib/bulk-pricing";

export interface MenuPricingValues {
  menuPriceStep: number;
  autoRepriceFromCost: boolean;
  lowMarginPercent: number;
}

/**
 * How menu prices are rounded, and whether they follow ingredient costs.
 *
 * Its own card and its own save, separate from the checkout options above it:
 * those decide how a *basket* is charged, while the step here rewrites what
 * every *dish* shows. Changing the step asks for confirmation first, because it
 * is the one setting on this page that moves the whole menu at once — even
 * though it is fully reversible, since the exact prices underneath never move.
 */
export function MenuPricingCard({ initial }: { initial: MenuPricingValues }) {
  const { t, locale } = useI18n();
  const c = t.costing;
  const toast = useToast();
  const router = useRouter();

  const [values, setValues] = React.useState(initial);
  const [marginText, setMarginText] = React.useState(String(initial.lowMarginPercent));
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const stepChanged = values.menuPriceStep !== initial.menuPriceStep;
  const margin = parseAmount(marginText);
  const marginInvalid = !Number.isFinite(margin) || margin < 0 || margin > 95;

  async function save() {
    setSaving(true);
    const result = await api.patch<{ reRounded: number }>("/api/settings/options", {
      menuPriceStep: values.menuPriceStep,
      autoRepriceFromCost: values.autoRepriceFromCost,
      lowMarginPercent: margin,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    toast.success(
      result.data.reRounded > 0
        ? c.reRounded.replace("{n}", formatNumber(result.data.reRounded, locale))
        : c.saved,
    );
    // The menu editor and the bulk card read these; refresh what they show.
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>{c.settingsTitle}</CardTitle>
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-sm leading-7 text-ink-600">{c.settingsHint}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={c.menuPriceStep}
            hint={c.menuPriceStepHint}
            htmlFor="menuPriceStep"
          >
            <Select
              id="menuPriceStep"
              value={String(values.menuPriceStep)}
              onChange={(e) =>
                setValues((v) => ({ ...v, menuPriceStep: Number(e.target.value) }))
              }
            >
              {PRICE_ROUNDING_STEPS.map((step) => (
                <option key={step} value={step}>
                  {step === 0 ? c.noRounding : formatMoneyWithUnit(step, locale)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={c.lowMargin}
            hint={c.lowMarginHint}
            htmlFor="lowMarginPercent"
            error={marginInvalid ? t.errors.fixErrors : undefined}
          >
            <Input
              id="lowMarginPercent"
              inputMode="numeric"
              value={marginText}
              onChange={(e) => setMarginText(e.target.value)}
              aria-invalid={marginInvalid || undefined}
            />
          </Field>
        </div>

        <Toggle
          checked={values.autoRepriceFromCost}
          onChange={(checked) =>
            setValues((v) => ({ ...v, autoRepriceFromCost: checked }))
          }
          label={c.autoReprice}
          description={c.autoRepriceHint}
        />

        <Button
          type="button"
          disabled={saving || marginInvalid}
          onClick={() => (stepChanged ? setConfirming(true) : void save())}
        >
          <Save className="size-4" />
          {c.save}
        </Button>
      </CardBody>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void save();
        }}
        title={c.confirmStepTitle}
        message={c.confirmStepBody}
        confirmLabel={c.confirmStep}
        cancelLabel={t.common.cancel}
      />
    </Card>
  );
}
