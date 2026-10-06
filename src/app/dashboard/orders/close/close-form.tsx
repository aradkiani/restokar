"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The count: the cashier types what is in the till and sees the difference
 * against what the day's orders say should be there, before recording it.
 */
export function CloseForm({
  day,
  cashTaken,
  openingCash: savedOpening,
  existing,
}: {
  day: string;
  /** Cash payments taken on the day's orders. */
  cashTaken: number;
  /** The float recorded with an earlier close of this day, else 0. */
  openingCash: number;
  existing: { countedCash: number; note: string | null; closedBy: string } | null;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const copy = t.cashClose;
  const [counted, setCounted] = React.useState<number | null>(
    existing?.countedCash ?? null,
  );
  const [opening, setOpening] = React.useState<number | null>(savedOpening);
  const [note, setNote] = React.useState(existing?.note ?? "");
  const [busy, setBusy] = React.useState(false);

  // The drawer should hold the opening float plus the cash taken today.
  const expectedCash = (opening ?? 0) + cashTaken;
  const difference = counted === null ? null : counted - expectedCash;
  const money = (value: number) => `${formatMoney(value, locale)} ${t.common.toman}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (counted === null) return;
    setBusy(true);
    const result = await api.post("/api/orders/close", {
      day,
      openingCash: opening ?? 0,
      countedCash: counted,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(copy.saved);
    router.refresh();
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <Field label={copy.openingCash} hint={copy.openingHint} htmlFor="close-opening">
            <MoneyInput
              id="close-opening"
              value={opening}
              onValueChange={setOpening}
              placeholder="0"
            />
          </Field>

          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-md)] bg-ink-50 px-4 py-3">
            <span className="text-sm font-bold text-ink-700">{copy.expectedCash}</span>
            <span className="text-lg font-black text-ink-900 tabular-nums">
              {money(expectedCash)}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={copy.counted} hint={copy.countHint} htmlFor="close-counted">
              <MoneyInput
                id="close-counted"
                value={counted}
                onValueChange={setCounted}
                placeholder="0"
              />
            </Field>
            <div className="flex flex-col justify-end">
              {difference !== null && (
                <p
                  className={cn(
                    "rounded-[var(--radius-md)] px-4 py-3 text-sm font-black tabular-nums",
                    difference === 0
                      ? "bg-emerald-50 text-emerald-800"
                      : difference > 0
                        ? "bg-sky-50 text-sky-800"
                        : "bg-red-50 text-red-800",
                  )}
                >
                  {copy.difference}:{" "}
                  {difference === 0
                    ? copy.balanced
                    : `${difference > 0 ? copy.surplus : copy.shortage} ${money(Math.abs(difference))}`}
                </p>
              )}
            </div>
          </div>

          <Field label={copy.note} htmlFor="close-note">
            <Textarea
              id="close-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={counted === null}>
              {existing ? copy.resubmit : copy.submit}
            </Button>
            {existing && (
              <>
                <a
                  href={`/print/close?day=${day}&auto=1`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-300 px-4 text-sm font-bold text-ink-800 hover:border-ink-400"
                >
                  <Printer className="size-4" />
                  {copy.print}
                </a>
                <span className="text-xs text-ink-500">{existing.closedBy}</span>
              </>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
