"use client";

import * as React from "react";
import { MessageSquareText } from "lucide-react";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatDateShort, formatMoneyWithUnit, formatNumber } from "@/lib/format";
import { CUSTOMER_SEGMENTS } from "@/lib/customers";
import {
  MAX_BROADCAST_PARTS,
  MAX_BROADCAST_TEXT_LENGTH,
  type BroadcastIssue,
  type SmsAudience,
  type SmsBroadcastStatus,
} from "@/lib/sms-broadcast";
import type { Locale } from "@/lib/i18n";

/**
 * Promotional SMS, from the venue's side: write it, see what it costs, pay.
 *
 * **Nothing here sends a message.** Paying puts the request in the admin queue,
 * where the Restokar team sends it with a separate tool. The composer says so
 * in its first line, so an owner is never left wondering why nothing arrived
 * the instant they paid.
 *
 * The price shown is a quote computed on the server from the same input the
 * purchase uses — the client never computes a figure it could get wrong, and
 * never sends one the server would trust.
 */

export interface BroadcastRow {
  id: string;
  audience: string;
  campaignName: string | null;
  text: string;
  recipientCount: number;
  smsParts: number;
  amount: number;
  status: SmsBroadcastStatus;
  createdAt: string;
  paidAt: string | null;
  sentAt: string | null;
}

interface Quote {
  body: string;
  characters: number;
  encoding: "GSM7" | "UCS2";
  parts: number;
  recipientCount: number;
  pricePerPart: number;
  amount: number;
  issue: BroadcastIssue | null;
  audience: SmsAudience;
  campaignName: string | null;
  checkoutEnabled: boolean;
}

const STATUS_TONE: Record<SmsBroadcastStatus, "brand" | "success" | "neutral"> = {
  PENDING_PAYMENT: "neutral",
  PAID: "brand",
  SENT: "success",
  CANCELED: "neutral",
};

// -------------------------------- composer ---------------------------------

export function SmsComposer({
  campaign,
  locale,
  onClose,
}: {
  /** When set, the campaign decides the audience and the select is hidden. */
  campaign: { id: string; name: string } | null;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const s = t.smsBroadcast;
  const toast = useToast();

  const [audience, setAudience] = React.useState<SmsAudience>("all");
  const [text, setText] = React.useState("");
  const [quoted, setQuoted] = React.useState<{ key: string; quote: Quote } | null>(null);
  const [paying, setPaying] = React.useState(false);

  /**
   * Synchronous guard against a double tap on "pay".
   *
   * `disabled` only takes effect after React re-renders, and the checkout
   * already paid for this lesson once: three quick taps created three orders.
   * A ref flips before the first `await`, so the second tap finds it set.
   */
  const payLock = React.useRef(false);

  const request = React.useMemo(
    () => ({
      text,
      audience: campaign ? undefined : audience,
      campaignId: campaign?.id ?? null,
    }),
    [text, audience, campaign],
  );
  const requestKey = JSON.stringify(request);

  /**
   * The live price, refreshed as the owner types or changes the audience.
   *
   * Debounced so a sentence is one aggregation rather than one per keystroke.
   * Whether the figure on screen is current is *derived* — the quote carries
   * the key it was computed for — rather than tracked with a loading flag set
   * from inside this effect, which the lint rules rightly flag as a cascading
   * render.
   */
  React.useEffect(() => {
    let cancelled = false;

    const id = setTimeout(async () => {
      const result = await api.post<Quote>("/api/sms-broadcasts/quote", request);
      if (cancelled) return;

      if (!result.ok) {
        toast.error(localizeApiError(result.error, t));
        return;
      }
      setQuoted({ key: requestKey, quote: result.data });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [request, requestKey, t, toast]);

  const quote = quoted?.quote ?? null;
  const current = quoted?.key === requestKey;

  async function pay() {
    if (payLock.current) return;
    payLock.current = true;
    setPaying(true);

    const result = await api.post<{ paymentUrl: string }>("/api/sms-broadcasts", request);

    if (!result.ok) {
      payLock.current = false;
      setPaying(false);
      toast.error(localizeApiError(result.error, t));
      return;
    }

    // The lock is deliberately left held: the browser is leaving for the
    // gateway, and a button that re-enables during navigation invites a second
    // request for the same broadcast.
    window.location.assign(result.data.paymentUrl);
  }

  const issueMessage =
    quote?.issue && !(quote.issue === "EMPTY" && !text.trim())
      ? s.issues[quote.issue].replace("{max}", formatNumber(MAX_BROADCAST_PARTS, locale))
      : null;

  const canPay =
    current && quote !== null && quote.issue === null && quote.checkoutEnabled && !paying;

  return (
    <Modal open onClose={onClose} title={s.title} size="md">
      <div className="space-y-4">
        <p className="text-sm text-ink-600">{s.intro}</p>

        {campaign ? (
          <p className="text-sm font-semibold text-ink-800">
            {s.forCampaign.replace("{name}", campaign.name)}
          </p>
        ) : (
          <Field label={s.audience} htmlFor="sms-audience">
            <Select
              id="sms-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as SmsAudience)}
            >
              <option value="all">{s.allCustomers}</option>
              {CUSTOMER_SEGMENTS.map((key) => (
                <option key={key} value={key}>
                  {t.customers.segments[key]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={s.text} htmlFor="sms-text">
          <Textarea
            id="sms-text"
            value={text}
            maxLength={MAX_BROADCAST_TEXT_LENGTH}
            placeholder={s.textPlaceholder}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>

        <p className="text-xs text-ink-500">
          {s.optOutNote.replace("{suffix}", quote ? optOutSuffixOf(quote) : "")}
        </p>

        {quote && text.trim() && (
          <div className="space-y-1.5">
            <span className="block text-xs text-ink-500">{s.preview}</span>
            <p className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 text-sm leading-7 whitespace-pre-wrap text-ink-800">
              {quote.body}
            </p>
            <span className="block text-xs text-ink-400">
              {s.characters.replace("{count}", formatNumber(quote.characters, locale))}
            </span>
          </div>
        )}

        <div className="space-y-2 rounded-[var(--radius-sm)] border border-ink-200 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={s.recipients}
              value={quote ? formatNumber(quote.recipientCount, locale) : "—"}
            />
            <Stat
              label={s.parts}
              value={quote ? formatNumber(quote.parts, locale) : "—"}
            />
            <Stat
              label={s.pricePerPart}
              value={quote ? formatMoneyWithUnit(quote.pricePerPart, locale) : "—"}
            />
            <Stat
              label={s.total}
              value={quote ? formatMoneyWithUnit(quote.amount, locale) : "—"}
              strong
            />
          </div>
          <p className="text-xs text-ink-500">
            {current ? s.consentNote : s.calculating}
          </p>
        </div>

        {issueMessage && current && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {issueMessage}
          </p>
        )}

        {quote && !quote.checkoutEnabled && (
          <p className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3 text-sm text-ink-600">
            {s.checkoutDisabled}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={paying}>
            {t.common.cancel}
          </Button>
          <Button type="button" disabled={!canPay} onClick={() => void pay()}>
            {paying ? s.paying : s.pay}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The marker the server appended, recovered from the preview so the note names
 * the exact string rather than restating a default that configuration may have
 * changed. It is always the final line of the body.
 */
function optOutSuffixOf(quote: Quote): string {
  const lines = quote.body.split("\n");
  return lines.length > 1 ? (lines.at(-1) ?? "") : "";
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs text-ink-500">{label}</span>
      <span
        className={
          strong
            ? "mt-0.5 block font-black text-ink-900 tabular-nums"
            : "mt-0.5 block font-bold text-ink-800 tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

// --------------------------------- history ---------------------------------

/** The venue's own requests. Counts and status — never a phone number. */
export function SmsHistory({
  broadcasts,
  locale,
}: {
  broadcasts: BroadcastRow[];
  locale: Locale;
}) {
  const { t } = useI18n();
  const s = t.smsBroadcast;

  const audienceLabel = (row: BroadcastRow) => {
    if (row.campaignName) return row.campaignName;
    if (row.audience === "all") return s.allCustomers;
    const segments = t.customers.segments as Record<string, string>;
    return segments[row.audience] ?? row.audience;
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <h2 className="text-lg font-black text-ink-900">{s.history}</h2>

        {broadcasts.length === 0 ? (
          <EmptyState
            icon={<MessageSquareText className="size-6" />}
            title={s.historyEmpty}
          />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs text-ink-500">
                  <th className="py-2 text-start font-semibold">{s.date}</th>
                  <th className="py-2 text-start font-semibold">{s.message}</th>
                  <th className="py-2 text-start font-semibold">{s.recipients}</th>
                  <th className="py-2 text-start font-semibold">{s.amount}</th>
                  <th className="py-2 text-start font-semibold">{s.status}</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100 last:border-0">
                    <td className="py-2.5 pe-3 text-xs whitespace-nowrap text-ink-500">
                      {formatDateShort(row.createdAt, locale)}
                    </td>
                    <td className="max-w-[18rem] py-2.5 pe-3">
                      <span className="block truncate text-ink-800">{row.text}</span>
                      <span className="block text-xs text-ink-500">
                        {audienceLabel(row)}
                      </span>
                    </td>
                    <td className="py-2.5 pe-3 tabular-nums">
                      {formatNumber(row.recipientCount, locale)}
                    </td>
                    <td className="py-2.5 pe-3 whitespace-nowrap tabular-nums">
                      {formatMoneyWithUnit(row.amount, locale)}
                    </td>
                    <td className="py-2.5">
                      <Badge tone={STATUS_TONE[row.status]}>
                        {s.statuses[row.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ------------------------------ payment result -----------------------------

/** Shown once, when the gateway sends the owner back here. */
export function SmsPaymentNotice({ outcome }: { outcome: "success" | "failed" }) {
  const { t } = useI18n();
  const s = t.smsBroadcast;

  return outcome === "success" ? (
    <p
      role="status"
      className="rounded-[var(--radius-md)] bg-emerald-50 p-4 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200"
    >
      {s.paymentSuccess}
    </p>
  ) : (
    <p
      role="alert"
      className="rounded-[var(--radius-md)] bg-red-50 p-4 text-sm font-bold text-red-800 ring-1 ring-red-200"
    >
      {s.paymentFailed}
    </p>
  );
}
