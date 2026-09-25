"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Download, MessageSquareText } from "lucide-react";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatDateTime, formatMoneyWithUnit, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SmsBroadcastStatus } from "@/lib/sms-broadcast";
import type { Locale } from "@/lib/i18n";

export type QueueFilter = "open" | "sent" | "canceled";

interface QueueRow {
  id: string;
  restaurantName: string;
  restaurantSlug: string;
  campaignName: string | null;
  audience: string;
  body: string;
  recipientCount: number;
  smsParts: number;
  amount: number;
  status: SmsBroadcastStatus;
  paidAt: string | null;
  sentAt: string | null;
  canceledAt: string | null;
  paymentRefId: string | null;
  paymentIsReal: boolean;
}

const STATUS_TONE: Record<
  SmsBroadcastStatus,
  "brand" | "success" | "neutral" | "warning"
> = {
  PENDING_PAYMENT: "neutral",
  PAID: "warning",
  SENT: "success",
  CANCELED: "neutral",
};

/**
 * Working the queue: copy the text, download the numbers, send with the
 * external tool, mark it sent.
 *
 * One card per broadcast rather than a table, because the one thing staff must
 * read in full — the exact text to paste — does not fit in a cell.
 *
 * A broadcast settled through the mock gateway is flagged in red and cannot be
 * marked sent. Nobody paid for it, and sending it would spend real credit on
 * the SMS line.
 */
export function SmsQueue({
  locale,
  filter,
  initialRows,
}: {
  locale: Locale;
  filter: QueueFilter;
  initialRows: QueueRow[];
}) {
  const { t } = useI18n();
  const s = t.smsBroadcast;
  const a = s.admin;
  const toast = useToast();

  const [rows, setRows] = React.useState(initialRows);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const tabs: { key: QueueFilter; label: string }[] = [
    { key: "open", label: a.filterOpen },
    { key: "sent", label: a.filterSent },
    { key: "canceled", label: a.filterCanceled },
  ];

  const audienceLabel = (row: QueueRow) => {
    if (row.audience === "all") return s.allCustomers;
    const segments = t.customers.segments as Record<string, string>;
    return segments[row.audience] ?? row.audience;
  };

  async function copy(row: QueueRow) {
    try {
      await navigator.clipboard.writeText(row.body);
      toast.success(a.copied);
    } catch {
      // Clipboard access can be refused (an insecure origin, a denied
      // permission). The text is on screen and selectable either way.
      toast.error(t.common.error);
    }
  }

  async function move(row: QueueRow, status: "SENT" | "CANCELED") {
    const question = status === "SENT" ? a.confirmSent : a.confirmCancel;
    if (!window.confirm(question)) return;

    setBusyId(row.id);
    const result = await api.patch<{ id: string; status: SmsBroadcastStatus }>(
      `/api/admin/sms-broadcasts/${row.id}`,
      { status },
    );
    setBusyId(null);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    toast.success(status === "SENT" ? a.markedSent : a.canceled);
    // It no longer belongs in this view; the other tabs read it fresh.
    setRows((current) => current.filter((r) => r.id !== row.id));
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{a.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{a.subtitle}</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "open" ? "/admin/sms" : `/admin/sms?status=${tab.key}`}
            aria-current={filter === tab.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 text-sm font-bold",
              filter === tab.key
                ? "border-brand-500 text-ink-900"
                : "border-ink-200 text-ink-500 hover:text-ink-800",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={<MessageSquareText className="size-6" />} title={a.empty} />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const sendable = row.status === "PAID" && row.paymentIsReal;
            return (
              <li key={row.id}>
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-ink-900">{row.restaurantName}</p>
                        <p className="text-xs text-ink-500" dir="ltr">
                          {row.restaurantSlug}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[row.status]}>
                        {s.statuses[row.status]}
                      </Badge>
                    </div>

                    {row.status === "PAID" && !row.paymentIsReal && (
                      <p
                        role="alert"
                        className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-bold text-red-800 ring-1 ring-red-200"
                      >
                        {a.mockPayment}
                      </p>
                    )}

                    <p className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 text-sm leading-7 whitespace-pre-wrap text-ink-800">
                      {row.body}
                    </p>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                      <Detail
                        label={s.audience}
                        value={row.campaignName ?? audienceLabel(row)}
                      />
                      <Detail
                        label={s.recipients}
                        value={formatNumber(row.recipientCount, locale)}
                      />
                      <Detail
                        label={s.parts}
                        value={formatNumber(row.smsParts, locale)}
                      />
                      <Detail
                        label={s.amount}
                        value={formatMoneyWithUnit(row.amount, locale)}
                      />
                      {row.paidAt && (
                        <Detail
                          label={a.paidAt}
                          value={formatDateTime(row.paidAt, locale)}
                        />
                      )}
                      {row.paymentRefId && (
                        <Detail label={a.refId} value={row.paymentRefId} ltr />
                      )}
                    </dl>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copy(row)}
                      >
                        <Copy className="size-4" />
                        {a.copyText}
                      </Button>
                      {/* A plain link: the route answers with an attachment, so
                          the browser downloads rather than navigates. */}
                      <a
                        href={`/api/admin/sms-broadcasts/${row.id}/recipients`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-ink-200 px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50"
                      >
                        <Download className="size-4" />
                        {a.download}
                      </a>

                      {row.status === "PAID" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!sendable || busyId === row.id}
                            onClick={() => void move(row, "SENT")}
                          >
                            {a.markSent}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => void move(row, "CANCELED")}
                          >
                            {a.cancel}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd
        className="font-semibold text-ink-800 tabular-nums"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
