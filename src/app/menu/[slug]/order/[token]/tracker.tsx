"use client";

import * as React from "react";
import {
  Check,
  ChefHat,
  CircleAlert,
  Radio,
  Receipt,
  UtensilsCrossed,
} from "lucide-react";
import { getDictionary } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Status = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELED";

const FLOW: Exclude<Status, "CANCELED">[] = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "DELIVERED",
];

const ICONS = {
  RECEIVED: Receipt,
  PREPARING: ChefHat,
  READY: UtensilsCrossed,
  DELIVERED: Check,
} as const;

/**
 * Live order status.
 *
 * Two independent update paths on purpose: an SSE subscription for instant
 * changes, plus a slow poll that repairs the display if the stream silently
 * dies — which it will, on a phone that sleeps or switches from wifi to mobile
 * data mid-meal.
 */
export function OrderStatusTracker({
  token,
  initialStatus,
  locale,
  placedAt,
}: {
  token: string;
  initialStatus: Status;
  locale: Locale;
  placedAt: string;
}) {
  const t = getDictionary(locale);
  const [status, setStatus] = React.useState<Status>(initialStatus);
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    const source = new EventSource(`/api/public/orders/${token}/stream`);

    source.addEventListener("status", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { status: Status };
        if (payload.status) setStatus(payload.status);
      } catch {
        /* ignore malformed frame */
      }
    });

    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);

    return () => source.close();
  }, [token]);

  // Safety net for a stream that stops delivering without erroring.
  React.useEffect(() => {
    if (status === "DELIVERED" || status === "CANCELED") return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/public/orders/${token}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (payload?.ok && payload.data?.status) setStatus(payload.data.status);
      } catch {
        /* offline — the next tick will retry */
      }
    }, 20_000);

    return () => clearInterval(interval);
  }, [token, status]);

  if (status === "CANCELED") {
    return (
      <div className="menu-surface p-6 text-center">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-red-500/15">
          <CircleAlert className="size-7 text-red-500" />
        </div>
        <p className="text-base font-black">{t.orderStatus.CANCELED}</p>
        <p className="mt-1 text-sm opacity-60">{t.orderStatus.canceledHint}</p>
      </div>
    );
  }

  const currentIndex = FLOW.indexOf(status as Exclude<Status, "CANCELED">);

  const hints = {
    RECEIVED: t.orderStatus.receivedHint,
    PREPARING: t.orderStatus.preparingHint,
    READY: t.orderStatus.readyHint,
    DELIVERED: t.orderStatus.deliveredHint,
  } as const;

  return (
    <div className="menu-surface p-5">
      <div className="mb-5 text-center">
        <p className="text-lg font-black">{t.orderStatus[status]}</p>
        <p className="mt-1 text-sm opacity-60">{hints[status as keyof typeof hints]}</p>
      </div>

      <ol className="flex items-start justify-between gap-1">
        {FLOW.map((step, index) => {
          const Icon = ICONS[step];
          const done = index <= currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="relative flex w-full items-center justify-center">
                {/* Connector to the previous step. Logical properties keep it
                    correct when the document flips to RTL. */}
                {index > 0 && (
                  <span
                    className="absolute end-1/2 h-0.5 w-full"
                    style={{
                      background:
                        index <= currentIndex ? "var(--m-primary)" : "var(--m-border)",
                    }}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors",
                    isCurrent &&
                      status !== "DELIVERED" &&
                      "animate-[pulse-ring_2s_infinite]",
                  )}
                  style={{
                    background: done ? "var(--m-primary)" : "var(--m-bg)",
                    color: done ? "var(--m-primary-contrast)" : "var(--m-muted)",
                    border: `2px solid ${done ? "var(--m-primary)" : "var(--m-border)"}`,
                  }}
                >
                  <Icon className="size-4.5" />
                </span>
              </div>
              <span
                className="text-center text-[11px] leading-tight font-bold"
                style={{ opacity: done ? 1 : 0.45 }}
              >
                {t.orderStatus[step]}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] opacity-50">
        <Radio className={cn("size-3", live && "animate-pulse")} />
        {t.orderStatus.liveUpdating}
        <span className="tabular-nums">
          ·{" "}
          {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(placedAt))}
        </span>
      </p>
    </div>
  );
}
