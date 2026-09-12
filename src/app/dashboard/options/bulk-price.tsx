"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoneyWithUnit, formatNumber, parseAmount } from "@/lib/format";
import {
  MAX_BULK_PERCENT,
  MIN_BULK_PERCENT,
  PRICE_ROUNDING_STEPS,
  type BulkPriceSummary,
} from "@/lib/bulk-pricing";

interface PreviewRow {
  id: string;
  name: string;
  price: number;
  nextPrice: number;
  compareAtPrice: number | null;
  nextCompareAtPrice: number | null;
}

interface BulkPriceResponse {
  applied: boolean;
  summary: BulkPriceSummary;
  preview: PreviewRow[];
}

/**
 * Raise every price on the menu at once.
 *
 * The riskiest control in the dashboard: one press rewrites every price a
 * customer sees, and there is no undo short of restoring a backup. So it is
 * built as preview-then-confirm rather than as a form that saves — the owner
 * sees real dishes with their real before-and-after prices, computed by the
 * same server function that will do the writing, before anything is committed.
 *
 * The preview is deliberately server-side rather than recomputed here. A
 * preview calculated in the browser is a second implementation of the pricing
 * rule, and the moment the two disagree the preview is worse than none.
 */
export function BulkPriceCard() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [percent, setPercent] = React.useState("10");
  const [roundTo, setRoundTo] = React.useState(String(10_000));
  const [preview, setPreview] = React.useState<BulkPriceResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const parsedPercent = parseAmount(percent);

  const outOfRange =
    !Number.isFinite(parsedPercent) ||
    parsedPercent < MIN_BULK_PERCENT ||
    parsedPercent > MAX_BULK_PERCENT;

  async function run(apply: boolean) {
    setBusy(true);
    const result = await api.post<BulkPriceResponse>("/api/products/bulk-price", {
      percent: parsedPercent,
      roundTo: Number(roundTo),
      apply,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    if (apply) {
      toast.success(
        `${formatNumber(result.data.summary.changed, locale)} ${t.options.bulkApplied}`,
      );
      // Any preview still on screen describes prices that no longer exist.
      setPreview(null);
      router.refresh();
      return;
    }

    setPreview(result.data);
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>{t.options.bulkTitle}</CardTitle>
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-sm leading-7 text-ink-600">{t.options.bulkHint}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t.options.bulkPercent}
            hint={t.options.bulkPercentHint}
            htmlFor="bulkPercent"
            error={outOfRange && percent.trim() !== "" ? t.options.bulkRange : undefined}
          >
            <Input
              id="bulkPercent"
              inputMode="decimal"
              value={percent}
              onChange={(event) => {
                setPercent(event.target.value);
                // The preview belongs to the numbers that produced it.
                setPreview(null);
              }}
              aria-invalid={outOfRange ? true : undefined}
            />
          </Field>

          <Field label={t.options.bulkRoundTo} htmlFor="bulkRoundTo">
            <Select
              id="bulkRoundTo"
              value={roundTo}
              onChange={(event) => {
                setRoundTo(event.target.value);
                setPreview(null);
              }}
            >
              {PRICE_ROUNDING_STEPS.map((step) => (
                <option key={step} value={step}>
                  {step === 0
                    ? t.options.bulkNoRounding
                    : formatMoneyWithUnit(step, locale)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || outOfRange}
            onClick={() => void run(false)}
          >
            <ArrowLeftRight className="size-4" />
            {t.options.bulkPreview}
          </Button>

          {preview && preview.summary.changed > 0 && (
            <Button type="button" disabled={busy} onClick={() => setConfirming(true)}>
              <TrendingUp className="size-4" />
              {t.options.bulkApply}
            </Button>
          )}
        </div>

        {preview && (
          <div className="rounded-[var(--radius-sm)] bg-ink-50 p-3">
            {preview.summary.changed === 0 ? (
              <p className="text-sm font-semibold text-ink-700">
                {t.options.bulkNoChanges}
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm font-bold text-ink-800">
                  {formatNumber(preview.summary.changed, locale)}{" "}
                  {t.options.bulkWillChange}{" "}
                  <span className="font-normal text-ink-500">
                    ({formatNumber(preview.summary.total, locale)}{" "}
                    {t.options.bulkTotalItems})
                  </span>
                </p>

                <ul className="space-y-1">
                  {preview.preview.map((row) => (
                    <li key={row.id} className="text-xs">
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-ink-700">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-ink-500 tabular-nums line-through">
                          {formatMoneyWithUnit(row.price, locale)}
                        </span>
                        <span className="shrink-0 font-bold text-emerald-700 tabular-nums">
                          {formatMoneyWithUnit(row.nextPrice, locale)}
                        </span>
                      </span>

                      {/*
                        The "was" figure gets its own line when the item is on
                        offer. It moves too, and an owner checking a bulk change
                        needs to see the discount survived it — that is the
                        number a guest compares against.
                      */}
                      {row.compareAtPrice !== null && row.nextCompareAtPrice !== null && (
                        <span className="mt-0.5 flex items-center justify-between gap-3 ps-3 text-[11px] text-ink-500">
                          <span className="min-w-0 flex-1 truncate">
                            {t.options.bulkWasPrice}
                          </span>
                          <span className="shrink-0 tabular-nums line-through">
                            {formatMoneyWithUnit(row.compareAtPrice, locale)}
                          </span>
                          <span className="shrink-0 font-bold tabular-nums">
                            {formatMoneyWithUnit(row.nextCompareAtPrice, locale)}
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {preview.summary.changed > preview.preview.length && (
                  <p className="mt-2 text-xs text-ink-500">
                    {t.options.bulkAndMore.replace(
                      "{n}",
                      formatNumber(
                        preview.summary.changed - preview.preview.length,
                        locale,
                      ),
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </CardBody>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void run(true);
        }}
        title={t.options.bulkConfirmTitle}
        message={t.options.bulkConfirmBody}
        confirmLabel={t.options.bulkApply}
        cancelLabel={t.common.cancel}
      />
    </Card>
  );
}
