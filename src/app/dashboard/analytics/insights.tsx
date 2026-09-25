import Link from "next/link";
import { Lightbulb, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  EmptyState,
} from "@/components/ui/card";
import {
  formatDate,
  formatMoneyWithUnit,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { COMPARISON_PRESETS, type ComparisonPreset } from "@/lib/insight-periods";
import type { InsightSeverity, SalesInsight } from "@/lib/sales-insights";
import type { SalesInsightResult } from "@/lib/sales-insights-server";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * "What should I know about my business right now?"
 *
 * A ranked list of measured changes, each with the numbers behind it. Nothing
 * here computes anything — the engine in `sales-insights.ts` decides what is
 * worth saying and in what order, and this only renders it. Keeping the two
 * apart is what lets the rules be tested without a browser.
 *
 * Copy comes from `t.insights`, so the whole section reads in the owner's
 * language and lays out RTL like every other dashboard screen.
 */

/**
 * How each interpolated value is formatted.
 *
 * Driven by the placeholder's name rather than by the message, so a new rule
 * that reuses `amount` or `percent` is formatted correctly without touching
 * this table. Anything unlisted is a count.
 */
const AS_MONEY = new Set([
  "amount",
  // Profitability placeholders. Money, so they read in Toman rather than as a
  // bare count of millions.
  "revenue",
  "cost",
  "shortfall",
  "uncostedRevenue",
]);
const AS_PERCENT = new Set([
  "percent",
  "share",
  "orderPercent",
  "aovPercent",
  "conversionRate",
  "driverShare",
  // Margins and cost coverage are all fractions, like every entry above.
  "margin",
  "menuMargin",
  "coverage",
  // Orders per menu visit, at one table and across the room. Fractions too,
  // and read far better as "40%" than as "۰٫۴ سفارش".
  "ratio",
  "venueRatio",
]);

function renderMessage(
  template: string,
  values: Record<string, number>,
  locale: Locale,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = values[key];
    if (value === undefined) return whole;

    if (AS_MONEY.has(key)) return formatMoneyWithUnit(value, locale);
    if (AS_PERCENT.has(key)) return formatPercent(Math.abs(value), locale);
    return formatNumber(value, locale);
  });
}

const SEVERITY_TONE: Record<
  InsightSeverity,
  "danger" | "warning" | "success" | "neutral"
> = {
  critical: "danger",
  warning: "warning",
  positive: "success",
  neutral: "neutral",
};

/**
 * Whether a rule's `metric`/`comparison` pair is money or a count.
 *
 * Revenue, basket size and contributor figures are Toman and must carry the
 * unit; order and customer figures are counts and must not. Rendering
 * "۱۰۳٬۸۳۱٬۰۰۰" bare beside "۳۵۹" invites reading one as the other.
 */
const MONEY_METRIC = new Set<SalesInsight["type"]>([
  "revenueChange",
  "revenueDriver",
  "aovChange",
  "topNegativeContributor",
  "topPositiveContributor",
  "categoryDecline",
  "categoryGrowth",
  // A table's decline is measured in Toman, like every decline above it. The
  // other three table rules carry a null `deltaPercent`, so they print no
  // supporting line and never reach this.
  "tableActivityDecline",
]);

function supporting(insight: SalesInsight, value: number, locale: Locale): string {
  return MONEY_METRIC.has(insight.type)
    ? formatMoneyWithUnit(value, locale)
    : formatNumber(value, locale);
}

/** A rule that produces the same insight twice must key the same way. */
function DirectionIcon({ direction }: { direction: SalesInsight["direction"] }) {
  if (direction === "up") return <TrendingUp className="size-4" aria-hidden />;
  if (direction === "down") return <TrendingDown className="size-4" aria-hidden />;
  return <Minus className="size-4" aria-hidden />;
}

export function SalesInsightsSection({
  result,
  preset,
  range,
  locale,
  t,
}: {
  result: SalesInsightResult;
  preset: ComparisonPreset;
  /** The chart's range, carried through so switching period keeps it. */
  range: number;
  locale: Locale;
  t: Dictionary;
}) {
  const copy = t.insights;
  const { windows } = result;

  const rangeLabel = (from: Date, to: Date) =>
    copy.currentRange
      .replace("{from}", formatDate(from, locale))
      .replace("{to}", formatDate(to, locale));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{copy.title}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-500">{copy.subtitle}</p>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {/* Period picker. Its own control rather than the chart's, because
            "what changed lately?" is a different question from "show me the
            last 90 days" — an owner watching today does not want the chart
            rescaled underneath them. */}
        <nav
          aria-label={copy.period}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {COMPARISON_PRESETS.map((value) => (
            <Link
              key={value}
              href={`/dashboard/analytics?range=${range}&insights=${value}`}
              aria-current={preset === value ? "true" : undefined}
              // `min-h-10` rather than relying on `tap-safe` alone: that utility
              // grows the *hit* region on coarse pointers without changing how
              // tall the control looks, which left these pills 16px high beside
              // the 40px range pills directly above them. Matching the sibling
              // control's sizing keeps the two rows reading as one toolbar.
              className={cn(
                "tap-safe inline-flex min-h-10 items-center justify-center rounded-full px-3.5 text-xs font-bold whitespace-nowrap transition-colors",
                preset === value
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-600 hover:text-ink-900",
              )}
            >
              {copy.periods[value]}
            </Link>
          ))}
        </nav>

        {/* The comparison, stated rather than implied. An insight whose window
            the owner cannot see is an insight they cannot check. */}
        <p className="text-xs text-ink-500">
          <span className="font-semibold text-ink-700">
            {rangeLabel(windows.current.from, windows.current.to)}
          </span>
          {" · "}
          {copy.comparedWith
            .replace("{from}", formatDate(windows.previous.from, locale))
            .replace("{to}", formatDate(windows.previous.to, locale))}
        </p>

        {windows.incomplete && (
          <p className="rounded-[var(--radius-sm)] bg-ink-50 p-2.5 text-xs text-ink-600">
            {copy.incompleteNote}
          </p>
        )}

        {result.status === "insufficientData" ? (
          <EmptyState
            icon={<Lightbulb className="size-6" />}
            title={copy.insufficient}
            description={copy.insufficientHint}
          />
        ) : result.insights.length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="size-6" />}
            title={copy.noChange}
            description={copy.noChangeHint}
          />
        ) : (
          <ul className="space-y-2.5">
            {result.insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                locale={locale}
                copy={copy}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * One finding, rendered.
 *
 * Exported so the table performance screen shows its findings in exactly the
 * card the analytics page uses. The rules differ; what an insight *is* — a
 * severity, a direction, a sentence from `t.insights.messages`, and the figures
 * behind it — is one thing, defined once.
 */
export function InsightCard({
  insight,
  locale,
  copy,
}: {
  insight: SalesInsight;
  locale: Locale;
  copy: Dictionary["insights"];
}) {
  const messages = copy.messages as Record<string, string | undefined>;
  const actions = copy.actions as Record<string, string | undefined>;
  const types = copy.types as Record<string, string | undefined>;

  const template = messages[insight.messageKey];
  const action = insight.actionKey ? actions[insight.actionKey] : undefined;

  return (
    <li className="rounded-[var(--radius-sm)] border border-ink-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[insight.severity]}>
          <DirectionIcon direction={insight.direction} />
          {types[insight.type] ?? insight.type}
        </Badge>

        {/* The entity the finding is about, when it is about one. A table is
            named by its number, which reads as a quantity on its own — so the
            noun comes from the dictionary rather than from the engine, which
            deliberately emits no words. */}
        {insight.entity && (
          <span className="text-sm font-bold text-ink-900">
            {insight.entity.kind === "table"
              ? `${copy.labels.table} ${insight.entity.name}`
              : insight.entity.name}
          </span>
        )}

        {insight.confidence === "low" && (
          <Badge tone="neutral">{copy.lowConfidence}</Badge>
        )}
      </div>

      <p className="mt-1.5 text-sm text-ink-700">
        {template ? renderMessage(template, insight.values, locale) : insight.messageKey}
      </p>

      {/* The figures behind the sentence, so an owner can check it rather than
          take it on trust. */}
      {insight.deltaPercent !== null && (
        <p className="mt-1 text-xs text-ink-500 tabular-nums">
          {copy.labels.current}: {supporting(insight, insight.metric, locale)}
          {" · "}
          {copy.labels.previous}: {supporting(insight, insight.comparison, locale)}
        </p>
      )}

      {action && (
        <p className="mt-1.5 text-xs text-ink-600">
          <span className="font-semibold">{copy.suggestion}:</span> {action}
        </p>
      )}
    </li>
  );
}
