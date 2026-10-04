"use client";

import * as React from "react";
import { Printer, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatMoney, formatNumber, formatTime, localizeDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ORDER_POLL_MS } from "@/lib/constants";

interface TableTabRow {
  table: string;
  total: number;
  billRequested: boolean;
  firstPlacedAt: string;
  orders: {
    id: string;
    orderNumber: number;
    total: number;
    status: string;
    paymentMethod: string;
    placedAt: string;
  }[];
}

/**
 * The board's Tables view: one card per table with unpaid orders from the last
 * few hours, its running total, and the two things a cashier does at the end
 * — print one bill for the lot, and mark the lot paid.
 *
 * `refreshKey` changes whenever the board hears about a new order, an update
 * or a call, so a bill request appears here as soon as it is made.
 */
export function TablesView({ refreshKey }: { refreshKey: number }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [tabs, setTabs] = React.useState<TableTabRow[] | null>(null);
  const [settling, setSettling] = React.useState<TableTabRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await api.get<TableTabRow[]>("/api/orders/tables");
    if (result.ok) setTabs(result.data);
  }, []);

  // Re-read whenever the board hears something; a late reply after the view
  // has gone is dropped.
  React.useEffect(() => {
    let current = true;
    void api.get<TableTabRow[]>("/api/orders/tables").then((result) => {
      if (current && result.ok) setTabs(result.data);
    });
    return () => {
      current = false;
    };
  }, [refreshKey]);

  React.useEffect(() => {
    const interval = setInterval(() => void load(), ORDER_POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function settle() {
    if (!settling) return;
    setBusy(true);
    const result = await api.post<{ settled: number; total: number }>(
      "/api/orders/tables/settle",
      { table: settling.table },
    );
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(
      t.kitchen.tableSettled.replace("{table}", localizeDigits(settling.table, locale)),
    );
    setSettling(null);
    void load();
  }

  if (tabs === null) {
    return <p className="py-16 text-center text-sm text-ink-500">{t.common.loading}</p>;
  }

  return (
    <section className="space-y-3" aria-label={t.kitchen.viewTables}>
      <p className="text-xs text-ink-500">{t.kitchen.tablesHint}</p>
      {tabs.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-ink-300 py-16 text-center text-sm text-ink-500">
          {t.kitchen.tablesEmpty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tabs.map((tab) => (
            <li
              key={tab.table}
              className={cn(
                "flex flex-col rounded-[var(--radius-lg)] border bg-surface p-4 shadow-[var(--shadow-soft)]",
                tab.billRequested
                  ? "border-emerald-400 ring-2 ring-emerald-100"
                  : "border-ink-200",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-black text-ink-900">
                    {t.kitchen.table} {localizeDigits(tab.table, locale)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {t.kitchen.tableOrders.replace(
                      "{n}",
                      formatNumber(tab.orders.length, locale),
                    )}{" "}
                    · {formatTime(tab.firstPlacedAt, locale)}
                  </p>
                </div>
                {tab.billRequested && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                    <Receipt className="size-3.5" />
                    {t.kitchen.billRequest}
                  </span>
                )}
              </div>

              <ul className="my-3 flex-1 space-y-1 border-y border-ink-100 py-2 text-xs text-ink-700">
                {tab.orders.map((order) => (
                  <li key={order.id} className="flex justify-between gap-2">
                    <span>
                      #{formatNumber(order.orderNumber, locale)}
                      {order.paymentMethod === "ONLINE" && (
                        <span className="ms-1 text-amber-700">
                          ({t.kitchen.awaitingPayment})
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(order.total, locale)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="flex items-baseline justify-between text-sm font-black text-ink-900">
                <span>{t.orderDetail.total}</span>
                <span className="tabular-nums">
                  {formatMoney(tab.total, locale)}{" "}
                  <span className="text-xs font-normal text-ink-500">
                    {t.common.toman}
                  </span>
                </span>
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={`/print/table?table=${encodeURIComponent(tab.table)}&auto=1`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs font-bold text-ink-800 hover:border-ink-400"
                >
                  <Printer className="size-4" />
                  {t.kitchen.tablePrint}
                </a>
                <button
                  type="button"
                  onClick={() => setSettling(tab)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Wallet className="size-4" />
                  {t.kitchen.tableSettle}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={settling !== null}
        onClose={() => setSettling(null)}
        size="sm"
        title={
          settling
            ? t.kitchen.tableSettleTitle.replace(
                "{table}",
                localizeDigits(settling.table, locale),
              )
            : ""
        }
        description={
          settling
            ? t.kitchen.tableSettleMessage.replace(
                "{total}",
                formatMoney(settling.total, locale),
              )
            : ""
        }
      >
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" onClick={() => setSettling(null)}>
            {t.common.cancel}
          </Button>
          <Button loading={busy} onClick={settle}>
            {t.kitchen.tableSettle}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
