"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { localizeDigits } from "@/lib/format";
import { cutoffMinute, minuteToClock, type BusinessHours } from "@/lib/business-day";

const toMinutes = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return ((h ?? 0) * 60 + (m ?? 0)) % 1440;
};

/**
 * Business-day hours for one site, with what they mean spelled out live:
 * when the day changes, and which day a late order is counted in.
 *
 * `inheritLabel` turns the switch into "same as the main venue" for a branch;
 * without it the switch is "count by calendar day".
 */
export function BusinessHoursCard({
  siteId,
  title,
  initial,
  inheritLabel,
  inherited,
}: {
  siteId?: string;
  title?: string;
  initial: BusinessHours | null;
  /** For a branch: the label for following the chain's hours. */
  inheritLabel?: string;
  /** The hours a branch follows while it has none of its own. */
  inherited?: BusinessHours | null;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const copy = t.businessDay;

  const [own, setOwn] = React.useState(initial !== null);
  const [start, setStart] = React.useState(minuteToClock(initial?.start ?? 8 * 60));
  const [end, setEnd] = React.useState(minuteToClock(initial?.end ?? 23 * 60));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const effective: BusinessHours | null = own
    ? { start: toMinutes(start), end: toMinutes(end) }
    : (inherited ?? null);
  const digits = (value: string) => localizeDigits(value, locale);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await api.put("/api/business-day", {
      siteId,
      hours: own ? { start, end } : null,
    });
    setBusy(false);
    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(copy.saved);
    router.refresh();
  }

  let explanation: string;
  if (!effective) {
    explanation = copy.calendarExplain;
  } else if (effective.start === effective.end) {
    explanation = copy.allDayExplain.replace(
      "{cutoff}",
      digits(minuteToClock(effective.start)),
    );
  } else {
    const cutoff = cutoffMinute(effective);
    // A cutoff in the small hours files them under the evening before; one
    // before midnight (a venue that closes early) files late orders forward.
    const template = cutoff < effective.start ? copy.explain : copy.explainEarlyClose;
    explanation = template
      .replaceAll("{start}", digits(minuteToClock(effective.start)))
      .replaceAll("{end}", digits(minuteToClock(effective.end)))
      .replaceAll("{cutoff}", digits(minuteToClock(cutoff)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock3 className="size-4" aria-hidden />
          {title ?? copy.title}
        </CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-4" aria-label={title ?? copy.title}>
          <p className="text-sm leading-7 text-ink-600">{copy.hint}</p>
          <Toggle
            checked={!own}
            onChange={(v) => setOwn(!v)}
            label={inheritLabel ?? copy.calendarDay}
          />
          {own && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={copy.start}
                htmlFor={`bd-start-${siteId ?? "main"}`}
                error={errors["hours.start"]}
              >
                <Input
                  id={`bd-start-${siteId ?? "main"}`}
                  type="time"
                  dir="ltr"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </Field>
              <Field
                label={copy.end}
                htmlFor={`bd-end-${siteId ?? "main"}`}
                error={errors["hours.end"]}
              >
                <Input
                  id={`bd-end-${siteId ?? "main"}`}
                  type="time"
                  dir="ltr"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </Field>
            </div>
          )}
          <p className="rounded-[var(--radius-md)] bg-ink-50 px-4 py-3 text-sm leading-7 text-ink-700">
            {explanation}
          </p>
          <p className="text-xs leading-6 text-ink-500">{copy.pastKept}</p>
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              {copy.save}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
