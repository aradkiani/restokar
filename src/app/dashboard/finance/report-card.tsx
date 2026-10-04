"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoney, formatNumber, formatPercent, formatYear } from "@/lib/format";
import { currentJalaliYear, jalaliMonthNames, toJalali } from "@/lib/jalali";
import type { Locale } from "@/lib/i18n";

type Preset = "month" | "quarter" | "custom";

/** The subset of the report payload this card previews. */
interface PreviewData {
  summary: {
    revenue: number;
    expenses: number;
    netProfit: number;
    margin: number;
    orders: number;
    averageOrderValue: number;
  };
  period: { days: number };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

/**
 * Report builder: pick a period, preview the headline figures, then open the
 * printable document.
 *
 * The preview exists so an owner never generates a document before knowing
 * whether the period actually contains data — the most common cause of a
 * confusing empty report.
 */
export function FinancialReportCard({ locale }: { locale: Locale }) {
  const { t } = useI18n();

  const now = React.useMemo(() => new Date(), []);

  /**
   * Persian users pick a Jalali month; English users keep the Gregorian one.
   * The calendar travels with the query so the server resolves the anchor in
   * the same calendar the owner was reading.
   */
  const calendar: "jalali" | "gregorian" = locale === "fa" ? "jalali" : "gregorian";
  const anchorNow = React.useCallback(
    (which: "jalali" | "gregorian") =>
      which === "jalali"
        ? { year: currentJalaliYear(), month: toJalali(now).jm }
        : { year: now.getFullYear(), month: now.getMonth() + 1 },
    [now],
  );

  const [preset, setPreset] = React.useState<Preset>("month");
  const [year, setYear] = React.useState(() => String(anchorNow(calendar).year));
  const [month, setMonth] = React.useState(() => String(anchorNow(calendar).month));
  const [from, setFrom] = React.useState(isoMonthsAgo(1));
  const [to, setTo] = React.useState(isoToday());

  // Switching language switches calendar, and a Jalali month number means
  // nothing on a Gregorian anchor. Re-derive during render rather than in an
  // effect so the dropdowns never paint one calendar's number under the
  // other's label.
  const [activeCalendar, setActiveCalendar] = React.useState(calendar);
  if (activeCalendar !== calendar) {
    const anchor = anchorNow(calendar);
    setActiveCalendar(calendar);
    setYear(String(anchor.year));
    setMonth(String(anchor.month));
  }

  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const params = React.useMemo(() => {
    const search = new URLSearchParams({ preset });
    if (preset === "custom") {
      search.set("from", from);
      search.set("to", to);
    } else {
      search.set("year", year);
      search.set("month", month);
      search.set("calendar", calendar);
    }
    return search.toString();
  }, [preset, from, to, year, month, calendar]);

  // A changed period invalidates the figures on screen. Done during render,
  // like the calendar switch above, so stale figures never paint at all.
  const [previewFor, setPreviewFor] = React.useState(params);
  if (previewFor !== params) {
    setPreviewFor(params);
    setPreview(null);
    setError(null);
  }

  async function loadPreview() {
    setLoading(true);
    setError(null);

    const result = await api.get<PreviewData>(`/api/reports/financial?${params}`);
    setLoading(false);

    if (!result.ok) {
      setError(localizeApiError(result.error, t));
      return;
    }
    setPreview(result.data);
  }

  // Jalali names come from dates inside each Jalali month. Running a Gregorian
  // month index through a Persian formatter — the previous approach — labelled
  // month 1 "دی", so the dropdown named one month and reported another.
  const monthNames = React.useMemo(
    () =>
      calendar === "jalali"
        ? jalaliMonthNames()
        : Array.from({ length: 12 }, (_, index) =>
            new Intl.DateTimeFormat("en-US", { month: "long" }).format(
              new Date(2024, index, 1),
            ),
          ),
    [calendar],
  );

  const years = React.useMemo(() => {
    const latest = anchorNow(calendar).year;
    return [0, 1, 2].map((offset) => latest - offset);
  }, [anchorNow, calendar]);

  const hasData = preview !== null && preview.summary.orders > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-brand-700" />
          {t.report.title}
        </CardTitle>
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-sm text-ink-500">{t.report.subtitle}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t.report.period} htmlFor="report-preset">
            <Select
              id="report-preset"
              value={preset}
              onChange={(event) => setPreset(event.target.value as Preset)}
            >
              <option value="month">{t.report.presetMonth}</option>
              <option value="quarter">{t.report.presetQuarter}</option>
              <option value="custom">{t.report.presetCustom}</option>
            </Select>
          </Field>

          {preset === "custom" ? (
            <>
              <Field label={t.report.from} htmlFor="report-from">
                <Input
                  id="report-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </Field>
              <Field label={t.report.to} htmlFor="report-to">
                <Input
                  id="report-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => setTo(event.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              {/* A quarter is three months long, so the dropdown is choosing
                  where the window *starts*, not which single month it covers.
                  Labelling both cases "month" made the quarterly report look
                  like it had simply reported the wrong period. */}
              <Field
                label={preset === "quarter" ? t.report.startMonth : t.report.month}
                hint={preset === "quarter" ? t.report.startMonthHint : undefined}
                htmlFor="report-month"
              >
                <Select
                  id="report-month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                >
                  {monthNames.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.report.year} htmlFor="report-year">
                <Select
                  id="report-year"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                >
                  {years.map((value) => (
                    <option key={value} value={String(value)}>
                      {formatYear(value, locale)}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-200"
          >
            {error}
          </p>
        )}

        {preview && !hasData && (
          <p className="rounded-[var(--radius-sm)] bg-ink-50 p-3 text-sm text-ink-600">
            {t.report.noData} — {t.report.noDataHint}
          </p>
        )}

        {preview && hasData && (
          <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-sm)] bg-ink-50 p-3 sm:grid-cols-4">
            <PreviewFigure
              label={t.finance.totalRevenue}
              value={formatMoney(preview.summary.revenue, locale)}
            />
            <PreviewFigure
              label={t.finance.totalExpenses}
              value={formatMoney(preview.summary.expenses, locale)}
            />
            <PreviewFigure
              label={
                preview.summary.netProfit >= 0 ? t.finance.netProfit : t.finance.netLoss
              }
              value={formatMoney(Math.abs(preview.summary.netProfit), locale)}
              tone={preview.summary.netProfit >= 0 ? "positive" : "negative"}
            />
            <PreviewFigure
              label={t.analytics.orders}
              value={`${formatNumber(preview.summary.orders, locale)} · ${formatPercent(
                preview.summary.margin,
                locale,
              )}`}
            />
          </dl>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadPreview} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.report.previewing}
              </>
            ) : (
              t.report.preview
            )}
          </Button>

          {/* A link, not a Button — Button is not polymorphic, and inventing an
              `as` prop for one call site would change a shared primitive. The
              classes mirror the primary variant so it reads identically. */}
          <a
            href={`/dashboard/finance/report?${params}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <FileText className="size-4" />
            {t.report.openReport}
          </a>
        </div>
      </CardBody>
    </Card>
  );
}

function PreviewFigure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-ink-900";

  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-black tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  );
}
