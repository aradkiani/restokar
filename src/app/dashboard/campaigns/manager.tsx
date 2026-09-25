"use client";

import * as React from "react";
import { Megaphone } from "lucide-react";
import { Card, CardBody, EmptyState, Badge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatDateShort, formatNumber } from "@/lib/format";
import { CUSTOMER_SEGMENTS, type CustomerSegment } from "@/lib/customers";
import {
  CAMPAIGN_STATUSES,
  UNMEASURABLE_METRICS,
  type CampaignStatus,
} from "@/lib/campaigns";
import { zonedWallClockOf } from "@/lib/time";
import type { Locale } from "@/lib/i18n";
import { SmsComposer, SmsHistory, SmsPaymentNotice, type BroadcastRow } from "./sms";

/**
 * The owner's campaign planner.
 *
 * Deliberately a list and one dialog, not a visual builder. A campaign is a
 * name, an audience, an optional bit of menu context and a window — a form.
 *
 * **Nothing on this screen sends anything by itself.** An owner who wants a
 * message delivered buys a promotional SMS (`sms.tsx`), which the Restokar team
 * sends by hand once it is paid. The notice at the top says so, and the delivery
 * figures are rendered as "not available" rather than as zeros, because a zero
 * reads as "nobody opened it" instead of "nothing was measured".
 */

interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  targetSegment: CustomerSegment;
  productId: string | null;
  productName: string | null;
  productIsFeatured: boolean;
  categoryId: string | null;
  categoryName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  audienceSnapshotSize: number | null;
  audienceSnapshotEligible: number | null;
  audienceSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CampaignDetailRow extends CampaignRow {
  audience: { estimatedAudience: number; eligibleAudience: number };
  allowedTransitions: CampaignStatus[];
  editable: boolean;
}

interface ListPayload {
  campaigns: CampaignRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface MenuRef {
  id: string;
  name: string;
}

/** Tone per status, so the same state reads the same way everywhere. */
const STATUS_TONE: Record<CampaignStatus, "brand" | "success" | "warning" | "neutral"> = {
  DRAFT: "neutral",
  SCHEDULED: "brand",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "neutral",
  CANCELED: "neutral",
};

export function CampaignManager({
  locale,
  initial,
  products,
  categories,
  broadcasts,
  paymentOutcome,
}: {
  locale: Locale;
  initial: ListPayload;
  products: MenuRef[];
  categories: MenuRef[];
  broadcasts: BroadcastRow[];
  /** Set once, when the gateway returns the owner here after an SMS payment. */
  paymentOutcome: "success" | "failed" | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const c = t.campaigns;

  const [data, setData] = React.useState(initial);
  const [status, setStatus] = React.useState<CampaignStatus | "">("");
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState<CampaignDetailRow | "new" | null>(null);
  const [composer, setComposer] = React.useState<{
    campaign: { id: string; name: string } | null;
  } | null>(null);

  const load = React.useCallback(
    async (next: { status?: string; page?: number }) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (next.status) params.set("status", next.status);
      if (next.page && next.page > 1) params.set("page", String(next.page));

      const result = await api.get<ListPayload>(`/api/campaigns?${params.toString()}`);
      setLoading(false);

      if (!result.ok) {
        toast.error(localizeApiError(result.error, t));
        return;
      }
      setData(result.data);
    },
    [toast, t],
  );

  const refresh = React.useCallback(() => void load({ status }), [load, status]);

  async function openDetail(id: string) {
    const result = await api.get<CampaignDetailRow>(`/api/campaigns/${id}`);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    setOpen(result.data);
  }

  const contextLabel = (row: CampaignRow) =>
    row.productName ?? row.categoryName ?? c.noContext;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{c.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{c.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setComposer({ campaign: null })}
          >
            {t.smsBroadcast.open}
          </Button>
          <Button type="button" onClick={() => setOpen("new")}>
            {c.create}
          </Button>
        </div>
      </header>

      {paymentOutcome && <SmsPaymentNotice outcome={paymentOutcome} />}

      {/* Stated once, at the top, rather than left for the owner to infer from
          the absence of a send button. */}
      <p className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 text-sm text-ink-600">
        {c.noDeliveryNotice}
      </p>

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={c.status} htmlFor="ca-status">
              <Select
                id="ca-status"
                value={status}
                onChange={(e) => {
                  const next = e.target.value as CampaignStatus | "";
                  setStatus(next);
                  void load({ status: next });
                }}
              >
                <option value="">{c.allStatuses}</option>
                {CAMPAIGN_STATUSES.map((key) => (
                  <option key={key} value={key}>
                    {c.statuses[key]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {data.campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="size-6" />}
              title={c.empty}
              description={status ? c.emptyFiltered : c.emptyHint}
            />
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-xs text-ink-500">
                    <th className="py-2 text-start font-semibold">{c.name}</th>
                    <th className="py-2 text-start font-semibold">{c.status}</th>
                    <th className="py-2 text-start font-semibold">{c.targetSegment}</th>
                    <th className="py-2 text-start font-semibold">{c.context}</th>
                    <th className="py-2 text-start font-semibold">
                      {c.audienceAtCommit}
                    </th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((row) => (
                    <tr key={row.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2.5 pe-3">
                        <span className="font-semibold text-ink-800">{row.name}</span>
                        {(row.startsAt || row.endsAt) && (
                          <span className="block text-xs text-ink-500">
                            {row.startsAt ? formatDateShort(row.startsAt, locale) : "—"}
                            {" – "}
                            {row.endsAt ? formatDateShort(row.endsAt, locale) : "—"}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <Badge tone={STATUS_TONE[row.status]}>
                          {c.statuses[row.status]}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-ink-700">
                        {t.customers.segments[row.targetSegment]}
                      </td>
                      <td className="py-2.5 text-xs text-ink-500">{contextLabel(row)}</td>
                      {/* The snapshot, not a live estimate: one aggregation per
                          row would be an N+1. The live figure is on the detail
                          dialog, where there is exactly one to compute. */}
                      <td className="py-2.5 tabular-nums">
                        {row.audienceSnapshotSize === null
                          ? "—"
                          : formatNumber(row.audienceSnapshotSize, locale)}
                      </td>
                      <td className="py-2.5 text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openDetail(row.id)}
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
                  onClick={() => void load({ status, page: data.page - 1 })}
                >
                  {c.previous}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.pageCount || loading}
                  onClick={() => void load({ status, page: data.page + 1 })}
                >
                  {c.next}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {open && (
        <CampaignDialog
          // Remounted per campaign, so the form's initial state comes from
          // props rather than from an effect that writes state on open.
          key={open === "new" ? "new" : open.id}
          campaign={open === "new" ? null : open}
          locale={locale}
          products={products}
          categories={categories}
          onClose={() => setOpen(null)}
          onChanged={(next) => {
            setOpen(next);
            refresh();
          }}
          onSendSms={(target) => {
            setOpen(null);
            setComposer({ campaign: target });
          }}
        />
      )}

      <SmsHistory broadcasts={broadcasts} locale={locale} />

      {composer && (
        <SmsComposer
          // Remounted per target, so the composer starts empty for each one.
          key={composer.campaign?.id ?? "standalone"}
          campaign={composer.campaign}
          locale={locale}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}

/**
 * Create, edit, preview and move one campaign.
 *
 * One dialog rather than three screens: the preview an owner needs before
 * scheduling is the same information the form already holds, so showing it
 * beside the fields is both simpler and more honest than a separate step.
 */
function CampaignDialog({
  campaign,
  locale,
  products,
  categories,
  onClose,
  onChanged,
  onSendSms,
}: {
  campaign: CampaignDetailRow | null;
  locale: Locale;
  products: MenuRef[];
  categories: MenuRef[];
  onClose: () => void;
  onChanged: (next: CampaignDetailRow | null) => void;
  onSendSms: (campaign: { id: string; name: string }) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const c = t.campaigns;

  const editable = campaign === null || campaign.editable;

  const [name, setName] = React.useState(campaign?.name ?? "");
  const [segment, setSegment] = React.useState<CustomerSegment>(
    campaign?.targetSegment ?? "atRisk",
  );
  const [productId, setProductId] = React.useState(campaign?.productId ?? "");
  const [categoryId, setCategoryId] = React.useState(campaign?.categoryId ?? "");
  const [startsAt, setStartsAt] = React.useState(
    campaign?.startsAt ? zonedWallClockOf(new Date(campaign.startsAt)) : "",
  );
  const [endsAt, setEndsAt] = React.useState(
    campaign?.endsAt ? zonedWallClockOf(new Date(campaign.endsAt)) : "",
  );

  const [audience, setAudience] = React.useState(campaign?.audience ?? null);
  const [saving, setSaving] = React.useState(false);

  /**
   * The live estimate, refreshed as the owner changes who they are aiming at.
   *
   * Debounced so switching between selects does not fire an aggregation per
   * keystroke, and counts-only: the endpoint has no shape that could return a
   * customer.
   */
  React.useEffect(() => {
    const id = setTimeout(async () => {
      const params = new URLSearchParams({ segment });
      if (productId) params.set("productId", productId);
      if (categoryId) params.set("categoryId", categoryId);

      const result = await api.get<{
        estimatedAudience: number;
        eligibleAudience: number;
      }>(`/api/campaigns/audience?${params.toString()}`);

      if (result.ok) setAudience(result.data);
    }, 300);

    return () => clearTimeout(id);
  }, [segment, productId, categoryId]);

  const body = {
    name,
    targetSegment: segment,
    productId: productId || null,
    categoryId: categoryId || null,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
  };

  async function save() {
    setSaving(true);
    const result = campaign
      ? await api.patch<CampaignDetailRow>(`/api/campaigns/${campaign.id}`, body)
      : await api.post<CampaignDetailRow>("/api/campaigns", body);
    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(campaign ? c.updated : c.created);
    onChanged(result.data);
  }

  async function move(to: CampaignStatus) {
    if (!campaign) return;
    setSaving(true);
    const result = await api.post<CampaignDetailRow>(
      `/api/campaigns/${campaign.id}/status`,
      { status: to },
    );
    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(c.statusChanged);
    onChanged(result.data);
  }

  async function remove() {
    if (!campaign || !window.confirm(c.confirmDelete)) return;
    setSaving(true);
    const result = await api.del(`/api/campaigns/${campaign.id}`);
    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(c.deleted);
    onChanged(null);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign ? campaign.name : c.createTitle}
      size="md"
    >
      <div className="space-y-4">
        {campaign && (
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[campaign.status]}>
              {c.statuses[campaign.status]}
            </Badge>
            {!editable && <span className="text-xs text-ink-500">{c.lockedHint}</span>}
          </div>
        )}

        <Field label={c.name} htmlFor="ca-name">
          <Input
            id="ca-name"
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
            placeholder={c.namePlaceholder}
          />
        </Field>

        <Field label={c.targetSegment} htmlFor="ca-segment">
          <Select
            id="ca-segment"
            value={segment}
            disabled={!editable}
            onChange={(e) => setSegment(e.target.value as CustomerSegment)}
          >
            {CUSTOMER_SEGMENTS.map((key) => (
              <option key={key} value={key}>
                {t.customers.segments[key]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${c.product} (${c.optional})`} htmlFor="ca-product">
            <Select
              id="ca-product"
              value={productId}
              disabled={!editable}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">{c.none}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={`${c.category} (${c.optional})`} htmlFor="ca-category">
            <Select
              id="ca-category"
              value={categoryId}
              disabled={!editable}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{c.none}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* dir="ltr": a date-time reads left to right even on an RTL page,
              the same reason the promotion-window inputs do. */}
          <Field label={c.startsAt} htmlFor="ca-start">
            <Input
              id="ca-start"
              type="datetime-local"
              dir="ltr"
              value={startsAt}
              disabled={!editable}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label={c.endsAt} htmlFor="ca-end">
            <Input
              id="ca-end"
              type="datetime-local"
              dir="ltr"
              value={endsAt}
              disabled={!editable}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
        </div>

        {campaign?.productIsFeatured && (
          <p className="text-xs text-ink-500">{c.featuredNote}</p>
        )}

        {/* The preview: what this campaign is configured to do, in the numbers
            the platform can actually stand behind. */}
        <div className="space-y-2 rounded-[var(--radius-sm)] border border-ink-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={c.estimatedAudience}
              value={
                audience
                  ? `${formatNumber(audience.estimatedAudience, locale)} ${c.customerUnit}`
                  : "—"
              }
            />
            <Stat
              label={c.eligibleAudience}
              value={audience ? formatNumber(audience.eligibleAudience, locale) : "—"}
              hint={c.eligibleHint}
            />
          </div>
          <p className="text-xs text-ink-500">{c.estimateHint}</p>

          {campaign?.audienceSnapshotSize !== null &&
            campaign?.audienceSnapshotSize !== undefined && (
              <p className="text-xs text-ink-500">
                {c.audienceAtCommit}:{" "}
                <span className="tabular-nums">
                  {formatNumber(campaign.audienceSnapshotSize, locale)}
                </span>
                {campaign.audienceSnapshotAt && (
                  <> · {formatDateShort(campaign.audienceSnapshotAt, locale)}</>
                )}
              </p>
            )}
        </div>

        {/* Never invented. Every one of these needs a delivery system that does
            not exist, and a zero would read as a real measurement. */}
        <div className="rounded-[var(--radius-sm)] border border-dashed border-ink-200 p-3">
          <p className="text-sm font-semibold text-ink-800">{c.deliveryMetrics}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {UNMEASURABLE_METRICS.map((metric) => (
              <span key={metric} className="text-xs text-ink-500">
                {c.metrics[metric]}: <span className="text-ink-400">{c.unavailable}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">{c.unavailableHint}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-2">
            {/* Only the moves the server would actually allow. The buttons are
                a convenience; `CAMPAIGN_TRANSITIONS` is the guard. */}
            {campaign?.allowedTransitions.map((to) => (
              <Button
                key={to}
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void move(to)}
              >
                {c.actions[to]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {campaign && campaign.status !== "CANCELED" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => onSendSms({ id: campaign.id, name: campaign.name })}
              >
                {c.sendSms}
              </Button>
            )}
            {campaign?.status === "DRAFT" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => void remove()}
              >
                {c.deleteDraft}
              </Button>
            )}
            {editable && (
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {campaign ? c.save : c.saveDraft}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="block text-xs text-ink-500">{label}</span>
      <span className="mt-0.5 block font-bold text-ink-900 tabular-nums">{value}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
    </div>
  );
}
