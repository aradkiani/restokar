"use client";

import * as React from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  ChefHat,
  CircleAlert,
  Clock,
  HandCoins,
  Info,
  Radio,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import {
  formatMoney,
  formatNumber,
  formatRelative,
  formatTime,
  localizeDigits,
  minutesSince,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ORDER_POLL_MS,
  ORDER_URGENT_MINUTES,
  REFUND_CLEAR_AFTER_MS,
  needsRefund,
} from "@/lib/constants";
import { isRetired } from "@/lib/order-retirement";
import { NEXT_STATUS } from "@/lib/order-flow";
import { OrderDetailDialog } from "./order-detail";
import type { Locale } from "@/lib/i18n";

type Status = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELED";

export interface StaffCall {
  id: string;
  tableNumber: string;
  note: string | null;
  createdAt: string;
}

export interface KitchenOrder {
  id: string;
  orderNumber: number;
  tableNumber: string | null;
  customerName: string;
  note: string | null;
  status: Status;
  paymentMethod: string;
  paymentStatus: string;
  /** Recorded by staff; included in `total` but never counted as revenue. */
  tip: number;
  total: number;
  placedAt: string;
  deliveredAt: string | null;
  /** When the money arrived. With `deliveredAt`, starts the retirement clock. */
  paidAt: string | null;
  canceledAt: string | null;
  /** Set once the owner confirms a cancelled, paid order was refunded. */
  refundedAt: string | null;
  items: { id: string; name: string; quantity: number; note: string | null }[];
}

const COLUMNS: { status: Exclude<Status, "CANCELED">; tone: string }[] = [
  { status: "RECEIVED", tone: "border-t-blue-500" },
  { status: "PREPARING", tone: "border-t-amber-500" },
  { status: "READY", tone: "border-t-emerald-500" },
  { status: "DELIVERED", tone: "border-t-ink-400" },
];

/** The next status each column's action moves an order to. */
/** The forward move from each status — the same table the server enforces. */
const NEXT = NEXT_STATUS as Partial<Record<string, Status>>;

export function KitchenBoard({
  initialOrders,
  initialCalls,
  locale,
}: {
  initialOrders: KitchenOrder[];
  initialCalls: StaffCall[];
  locale: Locale;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [orders, setOrders] = React.useState(initialOrders);
  const [connected, setConnected] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(true);
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  /** The order whose full detail is open, if any. */
  const [detailId, setDetailId] = React.useState<string | null>(null);
  // Re-render on a timer so the "5 minutes ago" ages and cards turn urgent
  // without needing a data refetch. Holding the clock reading in state rather
  // than calling Date.now() while rendering keeps the render pure and gives the
  // delivered-order cutoff below something stable to compare against.
  // Starts at 0 so the server and the first client render agree; the effect
  // fills in the real time immediately after mount.
  const [now, setNow] = React.useState(0);

  /**
   * Mirrors `soundOn` for the SSE listener below, which is subscribed once and
   * would otherwise close over a stale value. Synced in an effect rather than
   * assigned during render: a render-phase ref write is not safe under
   * concurrent rendering, and the listener only ever reads this asynchronously
   * (on an incoming event), long after commit.
   */
  const soundRef = React.useRef(soundOn);
  React.useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const [calls, setCalls] = React.useState<StaffCall[]>(initialCalls);

  const refreshCalls = React.useCallback(async () => {
    const result = await api.get<StaffCall[]>("/api/staff-calls");
    if (result.ok) setCalls(result.data);
  }, []);

  async function acknowledgeCall(id: string) {
    // Optimistic: the row leaves the strip immediately, because staff tap this
    // as they walk away from the table.
    setCalls((prev) => prev.filter((call) => call.id !== id));
    const result = await api.patch("/api/staff-calls", { id });
    if (!result.ok) void refreshCalls();
  }

  const refresh = React.useCallback(async () => {
    const result = await api.get<KitchenOrder[]>("/api/orders?scope=active");
    if (result.ok) {
      setOrders(
        result.data.map((order) => ({
          ...order,
          placedAt: new Date(order.placedAt).toISOString(),
          items: order.items ?? [],
        })),
      );
    }
  }, []);

  // Live feed. Any event triggers a refetch rather than patching state from the
  // payload: the board is small, and refetching cannot drift out of sync.
  React.useEffect(() => {
    const source = new EventSource("/api/orders/stream");

    source.addEventListener("created", () => {
      if (soundRef.current) playChime();
      void refresh();
    });
    source.addEventListener("updated", () => void refresh());
    // A guest pressing "call the waiter" is at least as urgent as a new order,
    // so it chimes too.
    source.addEventListener("staff-called", () => {
      if (soundRef.current) playChime();
      void refreshCalls();
    });

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    return () => source.close();
  }, [refresh, refreshCalls]);

  // Safety net if the stream dies quietly.
  React.useEffect(() => {
    const interval = setInterval(() => void refresh(), ORDER_POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // No fetch on mount: the page server-renders the open calls the same way it
  // does the orders, so the strip is correct on first paint and this only keeps
  // it fresh if the event stream drops.
  React.useEffect(() => {
    const interval = setInterval(() => void refreshCalls(), ORDER_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshCalls]);

  /*
    The clock is read once on mount, then kept fresh by the interval.

    It used to be set only by the interval. That was fine for ageing delivered
    cards off the board — the server already returns just the ones inside the
    window, so starting a tick late costs nothing — but the refund gate below
    also reads `now`, and there a zero is not "slightly stale", it is wrong:
    `canClear` is false and the countdown computes against 0, so every refund
    button rendered disabled reading a full 60 minutes however long ago the
    order was cancelled. That held for `ORDER_POLL_MS` — half a minute in which
    an order cancelled days earlier looked permanently unclearable, which is
    long enough for an owner to open the page, read a dead button and conclude
    the refund can never be cleared.

    `now` still starts at 0 rather than `Date.now()` so the server render and
    the first client render agree; seeding it in an initialiser would differ
    across that boundary and trip hydration. Reading the clock in the effect is
    the part that has to happen on the client, so it happens here.

    A deliberate `set-state-in-effect` site, commented per the convention: the
    value is the wall clock, which cannot be known during render without
    breaking hydration.
  */
  React.useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), ORDER_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  /**
   * Clears a refunded order off the queue.
   *
   * Not optimistic, unlike every other action on this board. The others are
   * tapped mid-service and must not wait on a round trip; this one asserts that
   * money went back to a customer, and the server can refuse it — the one-hour
   * wait is enforced there, not here. Removing the card before the server
   * agrees would tell the owner a debt was closed when it was not.
   */
  async function clearRefund(orderId: string) {
    setBusyId(orderId);
    const result = await api.patch(`/api/orders/${orderId}/refund`);
    setBusyId(null);

    if (!result.ok) {
      toast.error(result.error.message);
      void refresh();
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function move(orderId: string, status: Status) {
    setBusyId(orderId);
    // Optimistic: kitchen staff tap these with wet hands mid-service and must
    // not wait on a round trip.
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));

    const result = await api.patch(`/api/orders/${orderId}/status`, { status });
    setBusyId(null);

    if (!result.ok) {
      toast.error(result.error.message);
      void refresh();
    }
  }

  /**
   * Settles a cash bill from the board.
   *
   * Optimistic like `move`, for the same reason: this is tapped while clearing
   * a table, and a spinner between "the guest handed me cash" and the badge
   * turning green is time spent standing still.
   */
  async function togglePaid(orderId: string, paid: boolean) {
    setBusyId(orderId);
    /*
      `paidAt` moves with the status here too, mirroring what the server writes.

      Without it the optimistic row would claim to be paid with no payment time,
      and the retirement rule would fall back to `deliveredAt` — so settling a
      bill for an order handed over two hours ago would make the card vanish
      under the waiter's finger, before the server had even replied.
    */
    const paidAt = paid ? new Date().toISOString() : null;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, paymentStatus: paid ? "PAID" : "PENDING", paidAt } : o,
      ),
    );

    const result = await api.patch(`/api/orders/${orderId}/payment`, { paid });
    setBusyId(null);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      void refresh();
    }
  }

  /**
   * Delivered orders age off the board without needing a refetch.
   *
   * The 30-second tick above already re-renders, so recomputing the cutoff here
   * lets a handed-over order disappear on its own. An order the staff member
   * just marked delivered has no `deliveredAt` until the server responds, so it
   * is kept — otherwise it would blink out and reappear.
   */
  const byStatus = (status: Status) => {
    const rows = orders.filter((order) => order.status === status);
    if (status !== "DELIVERED") return rows;

    /*
      Before the mount effect runs, `now` is 0 and nothing is filtered — the
      server already returned only orders inside the window.

      The rule itself lives in `order-retirement.ts`, shared with the query that
      fetched these rows. This used to test `deliveredAt` against its own
      inlined cutoff, which meant an unpaid order was dropped here even though
      the server had deliberately kept it.
    */
    const visible = now === 0 ? rows : rows.filter((order) => !isRetired(order, now));

    /*
     * Unpaid bills float to the top of the delivered column.
     *
     * This column is the one place money can quietly walk out: the food is
     * gone, the table is turning over, and an unsettled bill three cards down
     * is a bill nobody chases. Paid orders are still shown — staff need to
     * confirm one was settled — but they sink, because they need no action.
     *
     * Sorted on a copy: `visible` is derived from state, and sorting in place
     * would mutate it during render.
     */
    const settled = (o: KitchenOrder) => (o.paymentStatus === "PAID" ? 1 : 0);
    return [...visible].sort((a, b) => settled(a) - settled(b));
  };

  /**
   * Cancelled orders the customer had already paid for, oldest debt first.
   *
   * Oldest rather than newest, which is the opposite of every other list here:
   * these are ordered by how long the venue has been holding someone else's
   * money, and the one that has waited longest is the one to deal with.
   *
   * They never reach `byStatus` — CANCELED is not one of the columns — so there
   * is no risk of a card appearing twice.
   */
  const refunds = orders
    .filter((order) => needsRefund(order))
    .sort(
      (a, b) =>
        new Date(a.canceledAt ?? 0).getTime() - new Date(b.canceledAt ?? 0).getTime(),
    );

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t.kitchen.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
            <Radio
              className={cn("size-3.5", connected && "animate-pulse text-emerald-600")}
            />
            {connected ? t.kitchen.connected : t.kitchen.disconnected}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSoundOn((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-300 bg-surface px-4 text-sm font-bold text-ink-800 hover:border-ink-400"
        >
          {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          {soundOn ? t.kitchen.soundOn : t.kitchen.soundOff}
        </button>
      </header>

      {/*
        Money owed back, above everything else on the page.

        A cancelled order that the customer had already paid for is the only
        thing on this board that represents a debt rather than a task, and it is
        the one a busy service is most likely to forget — the order is gone from
        the kitchen's point of view the moment it is cancelled. So it does not
        live in a column: it sits at the top, in red, until the owner says the
        money went back.
      */}
      {refunds.length > 0 && (
        <section
          aria-label={t.kitchen.refundsDue}
          className="rounded-[var(--radius-lg)] border-2 border-red-400 bg-red-50 p-3"
        >
          <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-red-900">
            <AlertTriangle className="size-4" />
            {t.kitchen.refundsDue}
            <span className="rounded-full bg-red-200 px-2 py-0.5 text-xs tabular-nums">
              {formatNumber(refunds.length, locale)}
            </span>
          </h2>

          <p className="mb-2.5 px-1 text-xs leading-5 text-red-800">
            {t.kitchen.refundsHint}
          </p>

          <ul className="space-y-2">
            {refunds.map((order) => {
              // `now` is 0 for the server render and the first client render,
              // where the wait counts as unfinished rather than flashing an
              // enabled button. The mount effect fills it in immediately after,
              // so that state lasts a frame — it used to last a poll interval,
              // which is what made cleared-long-ago refunds look stuck.
              const cancelledAt = order.canceledAt
                ? new Date(order.canceledAt).getTime()
                : 0;
              const elapsed = now === 0 ? 0 : now - cancelledAt;
              const canClear = now !== 0 && elapsed >= REFUND_CLEAR_AFTER_MS;
              const minutesLeft = Math.max(
                0,
                Math.ceil((REFUND_CLEAR_AFTER_MS - elapsed) / 60_000),
              );

              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-sm)] border border-red-300 bg-surface p-3"
                >
                  <span className="text-sm font-black text-red-900">
                    #{formatNumber(order.orderNumber, locale)}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">
                    {order.customerName}
                    {order.tableNumber && (
                      <span className="text-ink-500">
                        {" · "}
                        {t.kitchen.table} {localizeDigits(order.tableNumber, locale)}
                      </span>
                    )}
                  </span>

                  <span className="text-sm font-black text-red-900 tabular-nums">
                    {formatMoney(order.total, locale)}
                  </span>

                  <button
                    type="button"
                    onClick={() => void clearRefund(order.id)}
                    disabled={!canClear || busyId === order.id}
                    // The countdown is stated on the control itself. A disabled
                    // button with no reason reads as broken.
                    title={canClear ? undefined : t.kitchen.refundWaitHint}
                    className={cn(
                      "tap-safe inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-colors",
                      canClear
                        ? "bg-danger text-danger-fg hover:bg-danger-hover"
                        : "cursor-not-allowed bg-ink-100 text-ink-500",
                    )}
                  >
                    <Check className="size-3.5" />
                    {canClear
                      ? t.kitchen.refundDone
                      : `${t.kitchen.refundWait} ${formatNumber(minutesLeft, locale)}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Sits above the columns rather than inside one: a table waiting for
          someone is not a stage of the order workflow. */}
      {calls.length > 0 && (
        <section
          aria-label={t.kitchen.staffCalls}
          className="rounded-[var(--radius-lg)] border border-amber-300 bg-amber-50 p-3"
        >
          <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-amber-900">
            <BellRing className="size-4" />
            {t.kitchen.staffCalls}
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs tabular-nums">
              {formatNumber(calls.length, locale)}
            </span>
          </h2>
          <ul className="flex flex-wrap gap-2">
            {calls.map((call) => (
              <li key={call.id}>
                <button
                  type="button"
                  onClick={() => void acknowledgeCall(call.id)}
                  className="tap-safe inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300 bg-surface px-3 text-xs font-bold text-amber-900 hover:border-amber-400"
                >
                  <span>
                    {t.kitchen.table} {localizeDigits(call.tableNumber, locale)}
                  </span>
                  {/* Read from the clock, so the server and the phone can land
                      either side of a minute; the board re-renders on mount and
                      on every poll, which settles it. */}
                  <span className="font-normal opacity-70" suppressHydrationWarning>
                    {formatRelative(call.createdAt, locale)}
                  </span>
                  <Check className="size-3.5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map(({ status, tone }) => {
          const columnOrders = byStatus(status);
          const label =
            status === "RECEIVED"
              ? t.kitchen.newOrders
              : status === "PREPARING"
                ? t.kitchen.preparing
                : status === "READY"
                  ? t.kitchen.ready
                  : t.kitchen.delivered;

          return (
            <section
              key={status}
              className={cn(
                "rounded-[var(--radius-lg)] border border-t-4 border-ink-200 bg-ink-100/60 p-3",
                tone,
              )}
            >
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-black text-ink-800">
                {label}
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums">
                  {formatNumber(columnOrders.length, locale)}
                </span>
              </h2>

              <ul className="space-y-3">
                {columnOrders.map((order) => {
                  const waiting = minutesSince(order.placedAt);
                  // Anything sitting past 20 minutes gets flagged red.
                  const urgent =
                    status !== "DELIVERED" && waiting >= ORDER_URGENT_MINUTES;

                  return (
                    <li
                      key={order.id}
                      className={cn(
                        "rounded-[var(--radius-md)] border bg-surface p-3 shadow-[var(--shadow-soft)] transition-all",
                        urgent ? "border-red-300 ring-2 ring-red-100" : "border-ink-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-ink-900">
                            #{formatNumber(order.orderNumber, locale)}
                            {order.tableNumber && (
                              // `text-ink-50`, not `text-white`: ink-900 is the
                              // *inverting* end of the scale, so in dark mode it
                              // becomes near-white and white text vanished into
                              // it at 1.11:1. Paired with ink-50 the chip flips
                              // cleanly with the theme.
                              <span className="ms-2 rounded-md bg-ink-900 px-1.5 py-0.5 text-[11px] font-bold text-ink-50">
                                {t.kitchen.table}{" "}
                                {localizeDigits(order.tableNumber, locale)}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-600">
                            {order.customerName}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "flex items-center gap-1 text-[11px] font-bold tabular-nums",
                              urgent ? "text-red-600" : "text-ink-500",
                            )}
                          >
                            <Clock className="size-3" />
                            {formatTime(order.placedAt, locale)}
                          </span>

                          {/*
                            Its own control rather than a clickable card. The
                            card already carries the paid toggle, the advance
                            button and cancel; wrapping all of that in a button
                            nests interactive elements and turns every mis-aimed
                            tap on a busy pass into an opened dialog.
                          */}
                          <button
                            type="button"
                            onClick={() => setDetailId(order.id)}
                            aria-label={`${t.orderDetail.open} #${order.orderNumber}`}
                            title={t.orderDetail.open}
                            className="tap-safe rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                          >
                            <Info className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>

                      <ul className="my-2.5 space-y-1 border-y border-ink-100 py-2">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex gap-2 text-xs">
                            <span className="shrink-0 font-black text-brand-700 tabular-nums">
                              {formatNumber(item.quantity, locale)}×
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-ink-800">
                                {item.name}
                              </span>
                              {item.note && (
                                <span className="block text-[11px] text-amber-700">
                                  ↳ {item.note}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {order.note && (
                        <p className="mb-2.5 rounded-[var(--radius-xs)] bg-amber-50 p-2 text-[11px] leading-5 text-amber-900">
                          {order.note}
                        </p>
                      )}

                      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                        {/*
                          A cash bill is settled by tapping the badge itself —
                          the thing already saying "unpaid" is the thing you
                          press to fix it, so there is no second control to
                          find. Online orders keep the plain badge: their status
                          comes from the gateway and must not be editable here.
                        */}
                        {/* An online order whose payment never completed is
                          settled the same way: the guest pays at the counter. */}
                        {order.paymentMethod === "CASH_ON_SITE" ||
                        order.paymentStatus !== "PAID" ? (
                          <button
                            type="button"
                            disabled={busyId === order.id}
                            onClick={() =>
                              togglePaid(order.id, order.paymentStatus !== "PAID")
                            }
                            aria-pressed={order.paymentStatus === "PAID"}
                            title={
                              order.paymentStatus === "PAID"
                                ? t.kitchen.markUnpaidHint
                                : t.kitchen.markPaidHint
                            }
                            className={cn(
                              "tap-safe inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition-colors disabled:opacity-50",
                              order.paymentStatus === "PAID"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200",
                            )}
                          >
                            {order.paymentStatus === "PAID" ? (
                              <Check className="size-3" />
                            ) : (
                              <Wallet className="size-3" />
                            )}
                            {order.paymentStatus === "PAID"
                              ? t.kitchen.paid
                              : t.kitchen.unpaid}
                          </button>
                        ) : (
                          <Badge
                            tone={order.paymentStatus === "PAID" ? "success" : "neutral"}
                          >
                            {order.paymentStatus === "PAID"
                              ? t.kitchen.paid
                              : t.kitchen.unpaid}
                          </Badge>
                        )}
                        <span className="text-[11px] font-bold text-ink-700 tabular-nums">
                          {formatMoney(order.total, locale)} {t.common.toman}
                        </span>

                        {/*
                          Shown only when the guest actually left a tip, and not
                          editable here.

                          The board used to offer "add a tip" on every order,
                          which invited staff to type a number against a table
                          that had not tipped — an amount nobody had agreed to,
                          added to a total the guest already paid. A tip is the
                          guest's decision, taken at checkout; the kitchen board
                          reports it and nothing more.
                        */}
                        {order.tip > 0 && (
                          <span
                            className="inline-flex min-h-7 items-center gap-1 rounded-full bg-emerald-100 px-2.5 text-[11px] font-bold text-emerald-800 tabular-nums"
                            title={t.kitchen.tipLabel}
                          >
                            <HandCoins className="size-3" />
                            <bdi>{formatMoney(order.tip, locale)}</bdi>
                          </span>
                        )}

                        {/* Clock-derived; see the staff-call label above. */}
                        <span
                          className="text-[11px] text-ink-400"
                          suppressHydrationWarning
                        >
                          {formatRelative(order.placedAt, locale)}
                        </span>
                      </div>

                      {NEXT[order.status] && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === order.id}
                            onClick={() => move(order.id, NEXT[order.status]!)}
                            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-ink-900 text-xs font-bold text-ink-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
                          >
                            {order.status === "RECEIVED" && (
                              <ChefHat className="size-3.5" />
                            )}
                            {order.status !== "RECEIVED" && (
                              <Check className="size-3.5" />
                            )}
                            {order.status === "RECEIVED"
                              ? t.kitchen.markPreparing
                              : order.status === "PREPARING"
                                ? t.kitchen.markReady
                                : t.kitchen.markDelivered}
                          </button>

                          <button
                            type="button"
                            onClick={() => setCancelId(order.id)}
                            aria-label={t.kitchen.cancelOrder}
                            className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-ink-200 text-ink-400 hover:border-red-300 hover:text-red-600"
                          >
                            <CircleAlert className="size-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}

                {columnOrders.length === 0 && (
                  <li className="rounded-[var(--radius-md)] border border-dashed border-ink-300 py-8 text-center text-xs font-semibold text-ink-400">
                    {t.common.empty}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={cancelId !== null}
        onClose={() => setCancelId(null)}
        onConfirm={() => {
          if (cancelId) void move(cancelId, "CANCELED");
          setCancelId(null);
        }}
        title={t.kitchen.cancelConfirm}
        confirmLabel={t.kitchen.cancelOrder}
        cancelLabel={t.common.cancel}
      />

      <OrderDetailDialog
        orderId={detailId}
        onClose={() => setDetailId(null)}
        locale={locale}
        t={t}
      />
    </div>
  );
}

/**
 * Short synthesised chime for a new order. Generated with WebAudio rather than
 * shipped as an asset — no extra request, and no file to 404 on a kitchen
 * tablet with a flaky connection.
 */
function playChime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const now = ctx.currentTime;

    for (const [index, frequency] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.14 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + index * 0.14);
      osc.stop(now + index * 0.14 + 0.32);
    }

    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Autoplay policy or no audio device — silence is an acceptable outcome.
  }
}
