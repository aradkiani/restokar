"use client";

import * as React from "react";
import { LifeBuoy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  reply: string | null;
  createdAt: string;
}

/**
 * Submit a ticket and read the answer.
 *
 * One message and one reply, shown together — there is no threaded
 * conversation to render because there is none to have. A venue that needs to
 * follow up opens another ticket, which keeps every entry in this list a
 * complete question rather than a fragment of one.
 */
export function SupportPanel({ initialTickets }: { initialTickets: Ticket[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [tickets, setTickets] = React.useState<Ticket[]>(initialTickets);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const statusLabel: Record<TicketStatus, string> = {
    OPEN: t.options.ticketOpen,
    ANSWERED: t.options.ticketAnswered,
    CLOSED: t.options.ticketClosed,
  };

  const statusTone: Record<TicketStatus, string> = {
    OPEN: "bg-amber-100 text-amber-800",
    ANSWERED: "bg-emerald-100 text-emerald-800",
    CLOSED: "bg-ink-100 text-ink-500",
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api.post("/api/support", { subject, message });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    setTickets((current) => [result.data as Ticket, ...current]);
    setSubject("");
    setMessage("");
    toast.success(t.options.supportSent);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="size-4" />
            {t.options.supportTitle}
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-6 text-ink-500">{t.options.supportHint}</p>

          <form onSubmit={submit} className="space-y-3">
            <Field label={t.options.supportSubject} htmlFor="ticket-subject">
              <input
                id="ticket-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
              />
            </Field>

            <Field label={t.options.supportMessage} htmlFor="ticket-message">
              <textarea
                id="ticket-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                required
                rows={5}
                className="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface p-3 text-sm leading-7"
              />
            </Field>

            <Button type="submit" disabled={busy}>
              <Send className="size-4" />
              {t.options.supportSend}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {tickets.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-ink-500">
              {t.options.noTickets}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-sm font-extrabold">
                      {ticket.subject}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                        statusTone[ticket.status],
                      )}
                    >
                      {statusLabel[ticket.status]}
                    </span>
                    <span className="text-[11px] text-ink-400 tabular-nums">
                      {formatDateTime(ticket.createdAt, locale)}
                    </span>
                  </div>

                  <p className="text-xs leading-6 whitespace-pre-wrap text-ink-600">
                    {ticket.message}
                  </p>

                  {ticket.reply && (
                    <div className="rounded-[var(--radius-sm)] border-s-2 border-brand-600 bg-ink-50 p-3">
                      <p className="mb-1 text-[11px] font-bold text-brand-700">
                        {t.options.ticketReply}
                      </p>
                      <p className="text-xs leading-6 whitespace-pre-wrap text-ink-700">
                        {ticket.reply}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
