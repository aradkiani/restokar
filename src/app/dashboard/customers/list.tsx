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
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
}

interface ListPayload {
  customers: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
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
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);

  const load = React.useCallback(
    async (next: { segment?: string; search?: string; page?: number }) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (next.segment) params.set("segment", next.segment);
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
    const id = setTimeout(() => void load({ segment, search }), 300);
    return () => clearTimeout(id);
    // `load` is stable; re-running on it would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{c.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{c.subtitle}</p>
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

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
                        <Badge tone={SEGMENT_TONE[row.segment]}>
                          {c.segments[row.segment]}
                        </Badge>
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

        <div className="grid grid-cols-2 gap-3">
          <Stat label={c.orders} value={formatNumber(customer.orderCount, locale)} />
          <Stat label={c.revenue} value={formatMoney(customer.totalRevenue, locale)} />
          <Stat
            label={c.averageOrder}
            value={formatMoney(customer.averageOrderValue, locale)}
          />
          <Stat label={c.segment} value={c.segments[customer.segment]} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-ink-500">{label}</span>
      <span className="mt-0.5 block font-bold text-ink-900">{value}</span>
    </div>
  );
}
