"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { formatDate } from "@/lib/format";
import { MAX_EXTENSION_DAYS, MIN_EXTENSION_DAYS } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";

/**
 * Manual subscription extension.
 *
 * `reason` is mandatory and the type must be chosen explicitly: a gift and a
 * recorded payment have different accounting consequences, so the operator
 * states which one this is rather than the system guessing.
 */
export function ExtendSubscriptionForm({
  restaurantId,
  currentExpiration,
  locale,
}: {
  restaurantId: string;
  currentExpiration: string;
  locale: Locale;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [days, setDays] = React.useState("30");
  const [extensionType, setExtensionType] = React.useState<"MANUAL" | "GIFT">("MANUAL");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Shows the operator the resulting date before they commit.
  const projected = React.useMemo(() => {
    const parsed = Number(days);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const base = new Date(currentExpiration);
    const from = base > new Date() ? base : new Date();
    return new Date(from.getTime() + parsed * 86_400_000);
  }, [days, currentExpiration]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);

    const result = await api.post(
      `/api/admin/restaurants/${restaurantId}/extend-subscription`,
      { days: Number(days), extensionType, reason },
    );

    setSaving(false);

    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      setFieldErrors(fields);
      if (Object.keys(fields).length === 0)
        toast.error(localizeApiError(result.error, t));
      return;
    }

    toast.success(t.admin.extended);
    setReason("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="size-4 text-brand-700" />
          {t.admin.extendSubscription}
        </CardTitle>
      </CardHeader>

      <CardBody>
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-4" noValidate>
          <Field label={t.admin.extensionDays} htmlFor="days" error={fieldErrors.days}>
            <Input
              id="days"
              type="number"
              inputMode="numeric"
              min={MIN_EXTENSION_DAYS}
              max={MAX_EXTENSION_DAYS}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              aria-invalid={Boolean(fieldErrors.days)}
            />
          </Field>

          <Field label={t.admin.extensionType} htmlFor="extension-type">
            <Select
              id="extension-type"
              value={extensionType}
              onChange={(event) =>
                setExtensionType(event.target.value as "MANUAL" | "GIFT")
              }
            >
              <option value="MANUAL">{t.admin.extensionManual}</option>
              <option value="GIFT">{t.admin.extensionGift}</option>
            </Select>
          </Field>

          <Field
            label={t.admin.extensionReason}
            htmlFor="reason"
            hint={t.admin.extensionReasonHint}
            error={fieldErrors.reason}
            className="sm:col-span-2"
          >
            <Input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(fieldErrors.reason)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
            <Button type="submit" loading={saving}>
              {saving ? t.admin.extending : t.admin.extend}
            </Button>

            {projected && (
              <p className="text-sm text-ink-600">
                {t.admin.newExpiration}:{" "}
                <span className="font-bold tabular-nums">
                  {formatDate(projected, locale)}
                </span>
              </p>
            )}

            {extensionType === "GIFT" && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                <Gift className="size-3.5" />
                {t.admin.extensionGift}
              </p>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
