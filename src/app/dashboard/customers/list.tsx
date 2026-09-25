"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Card, CardBody, EmptyState, Badge } from "@/components/ui/card";
import { Field, Input, Select, Toggle } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { formatDateShort, formatMoney, formatNumber } from "@/lib/format";
import { CUSTOMER_SEGMENTS, type CustomerSegment } from "@/lib/customers";
import {
  VALUE_TIERS,
  type RetentionExplanation,
  type RetentionOpportunityKey,
  type ValueTier,
} from "@/lib/retention";
import { formatPercent } from "@/lib/format";
import { ExportButton } from "@/components/export-button";
import type { Locale } from "@/lib/i18n";

/**
 * The owner's view of who keeps coming back.
 *
 * Deliberately a list and a detail sheet, not a CRM. Everything shown is
 * derived from orders the venue already took, so there is nothing to edit here
 * except whether the guest agreed to be contacted — the one fact that is not a
 * consequence of something they bought.
 */

/** A customer as the API serialises one: dates are ISO strings over the wire. */
export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  marketingConsent: boolean;
  segment: CustomerSegment;
  valueTier: ValueTier;
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  typicalInterval: number | null;
}

interface RetentionSummary {
  withOrders: number;
  repeatCustomers: number;
  repeatRate: number;
  averageLifetimeValue: number;
  averageOrders: number;
}

interface Opportunity {
  key: RetentionOpportunityKey;
  count: number;
  revenueAtStake: number;
  filter: { segment?: CustomerSegment; valueTier?: ValueTier };
}

interface ListPayload {
  customers: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  summary: RetentionSummary;
  opportunities: Opportunity[];
}

type SegmentCounts = Record<CustomerSegment, number> & { total: number };

/** Tone per segment, so the same status reads the same way everywhere. */
const SEGMENT_TONE: Record<CustomerSegment, "brand" | "success" | "warning" | "neutral"> =
  {
    new: "brand",
    returning: "success",
    loyal: "success",
    atRisk: "warning",
    inactive: "neutral",
  };

export function CustomerList({
  locale,
  initial,
  segments: initialSegments,
}: {
  locale: Locale;
  initial: ListPayload;
  segments: SegmentCounts;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const c = t.customers;

  const [data, setData] = React.useState(initial);
  const [segments, setSegments] = React.useState(initialSegments);
  const [segment, setSegment] = React.useState<CustomerSegment | "">("");
  const [valueTier, setValueTier] = React.useState<ValueTier | "">("");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);

  const load = React.useCallback(
    async (next: {
      segment?: string;
      valueTier?: string;
      search?: string;
      page?: number;
    }) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (next.segment) params.set("segment", next.segment);
      if (next.valueTier) params.set("valueTier", next.valueTier);
      if (next.search) params.set("search", next.search);
      if (next.page && next.page > 1) params.set("page", String(next.page));

      const result = await api.get<ListPayload & { segments: SegmentCounts }>(
        `/api/customers?${params.toString()}`,
      );
      setLoading(false);

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setData(result.data);
      setSegments(result.data.segments);
    },
    [toast],
  );

  // Debounced so typing a name does not fire a request per keystroke.
  React.useEffect(() => {
    const id = setTimeout(() => void load({ segment, valueTier, search }), 300);
    return () => clearTimeout(id);
    // `load` is stable; re-running on it would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, valueTier, search]);

  /**
   * An action card's "show me" — the point of the whole screen.
   *
   * Sets the filters the opportunity describes rather than navigating anywhere:
   * the list below already answers the question, so the cheapest correct thing
   * is to point it at the right rows.
   */
  function applyOpportunity(filter: Opportunity["filter"]) {
    setSegment(filter.segment ?? "");
    setValueTier(filter.valueTier ?? "");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{c.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{c.subtitle}</p>
        </div>

        {/* The one export carrying personal data. Owner-only on the server and
            audited there; this button is simply where an owner finds it. */}
        <ExportButton dataset="customers" />
      </header>

      {/* Counts first: an owner opens this screen to see the shape of their
          customer base before looking at any individual. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SegmentTile label={c.total} value={segments.total} locale={locale} />
        {CUSTOMER_SEGMENTS.map((key) => (
          <SegmentTile
            key={key}
            label={c.segments[key]}
            value={segments[key]}
            locale={locale}
            onClick={() => setSegment(segment === key ? "" : key)}
            active={segment === key}
          />
        ))}
      </div>

      {/*
        What the book as a whole is doing.

        Above the individuals deliberately: an owner opening this screen is
        asking "is my retention healthy?" before "who is this person?". Only
        shown once somebody has actually ordered — every figure here divides by
        that count, and a row of zeroes teaches nothing.
      */}
      {data.summary.withOrders > 0 && (
        <Card>
          <CardBody>
            <p className="mb-3 text-sm font-semibold text-ink-800">{c.retention.title}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label={c.retention.withOrders}
                value={formatNumber(data.summary.withOrders, locale)}
              />
              <Stat
                label={c.retention.repeatRate}
                value={formatPercent(data.summary.repeatRate, locale)}
                hint={c.retention.repeatRateHint}
              />
              <Stat
                label={c.retention.averageLifetimeValue}
                value={formatMoney(data.summary.averageLifetimeValue, locale)}
              />
              <Stat
                label={c.retention.averageOrders}
                value={formatNumber(
                  Math.round(data.summary.averageOrders * 10) / 10,
                  locale,
                )}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {/* The action centre. Each card names a group and offers to show it. */}
      {data.opportunities.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-sm font-semibold text-ink-800">{c.opportunities.title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{c.opportunities.hint}</p>

            <ul className="mt-3 space-y-2.5">
              {data.opportunities.map((opportunity) => (
                <li
                  key={opportunity.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-ink-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">
                      {c.opportunities[opportunity.key].replace(
                        "{count}",
                        formatNumber(opportunity.count, locale),
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {c.opportunities[`${opportunity.key}Hint` as const]}
                    </p>
                    {/* What the group has spent historically, so "18 customers"
                        comes with a sense of what is actually at stake. */}
                    {opportunity.revenueAtStake > 0 && (
                      <p className="mt-0.5 text-xs text-ink-500">
                        {c.opportunities.revenueAtStake.replace(
                          "{amount}",
                          formatMoney(opportunity.revenueAtStake, locale),
                        )}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyOpportunity(opportunity.filter)}
                  >
                    {c.opportunities.viewCustomers}
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={c.search} htmlFor="cu-search">
              <Input
                id="cu-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={c.searchHint}
              />
            </Field>
            <Field label={c.segment} htmlFor="cu-segment">
              <Select
                id="cu-segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value as CustomerSegment | "")}
              >
                <option value="">{c.allSegments}</option>
                {CUSTOMER_SEGMENTS.map((key) => (
                  <option key={key} value={key}>
                    {c.segments[key]}
                  </option>
                ))}
              </Select>
            </Field>
            {/* Value is a second, independent axis — a guest can be both high
                value and at risk, which is the combination worth acting on. */}
            <Field label={c.valueTier} htmlFor="cu-value">
              <Select
                id="cu-value"
                value={valueTier}
                onChange={(e) => setValueTier(e.target.value as ValueTier | "")}
              >
                <option value="">{c.allValueTiers}</option>
                {VALUE_TIERS.map((key) => (
                  <option key={key} value={key}>
                    {c.valueTiers[key]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {data.customers.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title={c.empty}
              description={segment || search ? c.emptyFiltered : c.emptyHint}
            />
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-xs text-ink-500">
                    <th className="py-2 text-start font-semibold">{c.customer}</th>
                    <th className="py-2 text-start font-semibold">{c.segment}</th>
                    <th className="py-2 text-start font-semibold">{c.orders}</th>
                    <th className="py-2 text-start font-semibold">{c.revenue}</th>
                    <th className="py-2 text-start font-semibold">{c.lastOrder}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((row) => (
                    <tr key={row.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2.5 pe-3">
                        <span className="font-semibold text-ink-800">
                          {row.name ?? c.unnamed}
                        </span>
                        {/* dir="ltr" so a phone number reads left to right on
                            an RTL page, as the rest of the dashboard does. */}
                        <span className="block text-xs text-ink-500" dir="ltr">
                          {row.phone}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tone={SEGMENT_TONE[row.segment]}>
                            {c.segments[row.segment]}
                          </Badge>
                          {/* Only the top band is badged. Marking everyone
                              "standard" would be a column of noise. */}
                          {row.valueTier === "high" && (
                            <Badge tone="brand">{c.valueTiers.high}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.orderCount, locale)}
                      </td>
                      <td className="py-2.5 font-semibold tabular-nums">
                        {formatMoney(row.totalRevenue, locale)}
                      </td>
                      <td className="py-2.5 text-xs text-ink-500">
                        {row.daysSinceLastOrder === null
                          ? "—"
                          : c.daysAgo.replace(
                              "{n}",
                              formatNumber(row.daysSinceLastOrder, locale),
                            )}
                      </td>
                      <td className="py-2.5 text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openDetail(row.id, setDetail, toast)}
                        >
                          {c.view}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Stated rather than hidden: the count is the unfiltered total,
              because a segment is derived from recency and cannot be a WHERE
              clause. A filtered page can therefore be shorter than its size. */}
          {data.pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-ink-500">
                {c.pageOf
                  .replace("{page}", formatNumber(data.page, locale))
                  .replace("{pages}", formatNumber(data.pageCount, locale))}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1 || loading}
                  onClick={() => void load({ segment, search, page: data.page - 1 })}
                >
                  {c.previous}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.pageCount || loading}
                  onClick={() => void load({ segment, search, page: data.page + 1 })}
                >
                  {c.next}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {detail && (
        <CustomerDetailDialog
          customer={detail}
          locale={locale}
          onClose={() => setDetail(null)}
          onConsentChange={(next) => setDetail({ ...detail, marketingConsent: next })}
        />
      )}
    </div>
  );
}

function SegmentTile({
  label,
  value,
  locale,
  onClick,
  active,
}: {
  label: string;
  value: number;
  locale: Locale;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <span className="block text-xs text-ink-500">{label}</span>
      <span className="mt-0.5 block text-xl font-black text-ink-900 tabular-nums">
        {formatNumber(value, locale)}
      </span>
    </>
  );

  // A tile that filters is a button; the total, which filters nothing, is not —
  // a control that looks interactive and does nothing is worse than plain text.
  if (!onClick) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap-safe rounded-[var(--radius-sm)] border p-3 text-start transition-colors ${
        active ? "border-brand-600 bg-brand-50" : "border-ink-200 hover:bg-ink-50"
      }`}
    >
      {content}
    </button>
  );
}

interface CustomerDetail extends CustomerRow {
  explanation: RetentionExplanation;
  recentOrders: {
    id: string;
    orderNumber: number;
    placedAt: string;
    status: string;
    total: number;
    restaurantName: string;
  }[];
}

async function openDetail(
  id: string,
  setDetail: (c: CustomerDetail) => void,
  toast: ReturnType<typeof useToast>,
) {
  const result = await api.get<CustomerDetail>(`/api/customers/${id}`);
  if (!result.ok) {
    toast.error(result.error.message);
    return;
  }
  setDetail(result.data);
}

function CustomerDetailDialog({
  customer,
  locale,
  onClose,
  onConsentChange,
}: {
  customer: CustomerDetail;
  locale: Locale;
  onClose: () => void;
  onConsentChange: (next: boolean) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const c = t.customers;
  const [saving, setSaving] = React.useState(false);

  async function toggleConsent(next: boolean) {
    setSaving(true);
    const result = await api.patch(`/api/customers/${customer.id}`, {
      marketingConsent: next,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    onConsentChange(next);
    toast.success(t.common.saved);
  }

  // The dashboard's own date helper, so a Jalali date here reads exactly as it
  // does on every other screen.
  const date = (iso: string | null) => (iso ? formatDateShort(iso, locale) : "—");

  return (
    <Modal open onClose={onClose} title={customer.name ?? c.unnamed} size="md">
      <div className="space-y-4">
        <p className="text-sm text-ink-500" dir="ltr">
          {customer.phone}
        </p>

        {/*
          The classification, and why.

          The reason is the whole point: «معمولاً هر ۱۶ روز سفارش می‌دادند، اما
          ۳۷ روز است خبری نیست» is something an owner can check against their own
          memory of the guest and act on. A bare badge is something they have to
          believe.
        */}
        <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={SEGMENT_TONE[customer.segment]}>
              {c.segments[customer.segment]}
            </Badge>
            {customer.valueTier === "high" && (
              <Badge tone="brand">{c.valueTiers.high}</Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-700">
            {explanationText(customer.explanation, c, locale)}
          </p>
          {/* Stated where it is known, and stated as absent where it is not —
              rather than the screen quietly omitting a figure it could not
              compute, which reads as a bug. */}
          <p className="mt-1 text-xs text-ink-500">
            {customer.typicalInterval === null
              ? c.notEnoughHistory
              : `${c.typicalInterval}: ${c.everyNDays.replace(
                  "{n}",
                  formatNumber(customer.typicalInterval, locale),
                )}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label={c.orders} value={formatNumber(customer.orderCount, locale)} />
          <Stat label={c.revenue} value={formatMoney(customer.totalRevenue, locale)} />
          <Stat
            label={c.averageOrder}
            value={formatMoney(customer.averageOrderValue, locale)}
          />
          <Stat label={c.valueTier} value={c.valueTiers[customer.valueTier]} />
          <Stat label={c.firstOrder} value={date(customer.firstOrderAt)} />
          <Stat label={c.lastOrder} value={date(customer.lastOrderAt)} />
        </div>

        {/* The only editable field. Nothing is sent anywhere yet — this records
            permission so that a future gateway has it rather than assuming it. */}
        <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3">
          <Toggle
            checked={customer.marketingConsent}
            onChange={(v) => void toggleConsent(v)}
            disabled={saving}
            label={c.marketingConsent}
            description={c.marketingConsentHint}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink-800">{c.recentOrders}</p>
          {customer.recentOrders.length === 0 ? (
            <p className="text-xs text-ink-500">{c.noOrders}</p>
          ) : (
            <ul className="space-y-1.5">
              {customer.recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-ink-800">
                    #{formatNumber(order.orderNumber, locale)}
                    <span className="ms-2 text-xs text-ink-500">
                      {date(order.placedAt)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(order.total, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="block text-xs text-ink-500">{label}</span>
      <span className="mt-0.5 block font-bold text-ink-900">{value}</span>
      {hint && <span className="mt-0.5 block text-[0.6875rem] text-ink-400">{hint}</span>}
    </div>
  );
}

/**
 * The sentence behind a classification, with its numbers filled in.
 *
 * The dictionary owns the wording and the engine owns the facts — this only
 * joins them. Every reason key is present in both dictionaries, so a missing
 * one is a compile error rather than a blank line on the screen.
 */
function explanationText(
  explanation: RetentionExplanation,
  c: ReturnType<typeof useI18n>["t"]["customers"],
  locale: Locale,
): string {
  return c.reasons[explanation.reason]
    .replace("{n}", formatNumber(explanation.idleDays ?? 0, locale))
    .replace("{interval}", formatNumber(explanation.typicalInterval ?? 0, locale))
    .replace("{orders}", formatNumber(explanation.orderCount, locale));
}
