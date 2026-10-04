"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoney, formatNumber } from "@/lib/format";
import { fromMilli, parseQuantity } from "@/lib/inventory";
import { countVariance } from "@/lib/inventory-ledger";
import { cn } from "@/lib/utils";
import { useQuantityLabel, type StockItemOption } from "./shared";

/**
 * A physical count: type what is on the shelf for the items counted, see the
 * difference against the books, post.
 *
 * The preview compares against the figures this page was loaded with; the
 * server re-reads the books at the moment of posting, so orders taken while
 * somebody was counting are already accounted for.
 */
export function CountForm({
  siteId,
  items,
}: {
  siteId: string;
  items: StockItemOption[];
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const quantity = useQuantityLabel();
  const copy = t.stock;
  const active = items.filter((item) => item.isActive);

  const [counts, setCounts] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const entered = active.filter((item) => (counts[item.id] ?? "").trim() !== "");
  const variance = countVariance(
    entered.map((item) => ({
      itemId: item.id,
      expectedMilli: item.quantityMilli,
      countedMilli: parseQuantity(counts[item.id] ?? ""),
      unitCost: item.unitCost,
    })),
  );
  const deltaOf = new Map(variance.lines.map((line) => [line.itemId, line]));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (entered.length === 0) return;
    if (!window.confirm(copy.confirmCount)) return;
    setBusy(true);
    const result = await api.post("/api/inventory/stocktakes", {
      siteId,
      note: note.trim() || undefined,
      lines: entered.map((item) => ({
        itemId: item.id,
        counted: fromMilli(parseQuantity(counts[item.id] ?? "")),
      })),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(copy.countSaved);
    setCounts({});
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={copy.views.count}>
      <p className="text-sm text-ink-600">{copy.countHint}</p>

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-surface">
        {active.map((item) => {
          const line = deltaOf.get(item.id);
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <label
                  htmlFor={`c-${item.id}`}
                  className="block truncate text-sm font-bold text-ink-900"
                >
                  {item.name}
                </label>
                <p className="text-xs text-ink-500">
                  {copy.expected}: <bdi>{quantity(item.quantityMilli, item.unit)}</bdi>
                  {line && line.deltaMilli !== 0 && (
                    <span
                      className={cn(
                        "ms-2 font-bold",
                        line.deltaMilli < 0 ? "text-red-700" : "text-emerald-700",
                      )}
                    >
                      <bdi>
                        {line.deltaMilli > 0 ? "+" : "−"}
                        {quantity(Math.abs(line.deltaMilli), item.unit)}
                      </bdi>
                    </span>
                  )}
                </p>
              </div>
              <Input
                id={`c-${item.id}`}
                inputMode="decimal"
                placeholder={copy.counted}
                value={counts[item.id] ?? ""}
                onChange={(e) =>
                  setCounts((current) => ({ ...current, [item.id]: e.target.value }))
                }
                className="h-10 w-28 shrink-0 text-center"
              />
            </li>
          );
        })}
      </ul>

      <Field label={copy.note} hint={t.common.optional} htmlFor="c-note">
        <Textarea
          id="c-note"
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-700">
            {entered.length === 0 ? (
              copy.nothingCounted
            ) : (
              <>
                <p className="font-bold">
                  {copy.countedItems.replace(
                    "{count}",
                    formatNumber(entered.length, locale),
                  )}
                </p>
                <p className="mt-0.5 text-xs">
                  <span className="text-red-700">
                    {copy.shortage}: {formatMoney(variance.shortage, locale)}
                  </span>
                  <span className="mx-2 text-ink-300">|</span>
                  <span className="text-emerald-700">
                    {copy.surplus}: {formatMoney(variance.surplus, locale)}
                  </span>{" "}
                  {t.common.toman}
                </p>
              </>
            )}
          </div>
          <Button type="submit" loading={busy} disabled={entered.length === 0}>
            {copy.postCount}
          </Button>
        </CardBody>
      </Card>
    </form>
  );
}
