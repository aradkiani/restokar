"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
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
  restaurantName: string;
  restaurantSlug: string;
}

/**
 * The support queue.
 *
 * Replying marks a ticket ANSWERED; closing it says the exchange is finished.
 * Both go through the same PATCH, so an admin cannot accidentally close a
 * ticket without having written the answer the venue will read.
 */
export function SupportInbox({ initialTickets }: { initialTickets: Ticket[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [tickets, setTickets] = React.useState<Ticket[]>(initialTickets);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

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

  async function send(ticket: Ticket, status: TicketStatus) {
    const reply = (drafts[ticket.id] ?? ticket.reply ?? "").trim();
    if (!reply) return;

    setBusyId(ticket.id);
    const result = await api.patch(`/api/admin/support/${ticket.id}`, { reply, status });
    setBusyId(null);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    setTickets((current) =>
      current.map((row) => (row.id === ticket.id ? { ...row, reply, status } : row)),
    );
    setDrafts((current) => ({ ...current, [ticket.id]: "" }));
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="py-12 text-center text-sm font-semibold text-ink-500">
            {t.admin.supportInboxEmpty}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-ink-900">{ticket.subject}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    statusTone[ticket.status],
                  )}
                >
                  {statusLabel[ticket.status]}
                </span>
                <span className="ms-auto text-[11px] text-ink-400 tabular-nums">
                  {formatDateTime(ticket.createdAt, locale)}
                </span>
              </div>

              <p className="text-xs font-semibold text-ink-500">
                {ticket.restaurantName}{" "}
                <span dir="ltr" className="text-ink-400">
                  /menu/{ticket.restaurantSlug}
                </span>
              </p>

              <p className="rounded-[var(--radius-sm)] bg-ink-50 p-3 text-sm leading-7 whitespace-pre-wrap text-ink-700">
                {ticket.message}
              </p>

              <textarea
                value={drafts[ticket.id] ?? ticket.reply ?? ""}
                onChange={(e) =>
                  setDrafts((current) => ({ ...current, [ticket.id]: e.target.value }))
                }
                rows={3}
                placeholder={t.admin.supportReplyPlaceholder}
                className="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface p-3 text-sm leading-7"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => send(ticket, "ANSWERED")}
                  disabled={busyId === ticket.id}
                >
                  <Send className="size-4" />
                  {t.admin.supportSendReply}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => send(ticket, "CLOSED")}
                  disabled={busyId === ticket.id}
                >
                  {t.admin.supportClose}
                </Button>
              </div>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}
