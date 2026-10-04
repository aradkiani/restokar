"use client";

import * as React from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * The bar above the receipt: switch between bill and ticket, choose the paper
 * width, print. Hidden from the printout itself (`no-print`).
 */
export function PrintControls({
  kind,
  paper,
  auto,
  orderId,
}: {
  kind: "bill" | "ticket";
  paper: "80" | "58";
  auto: boolean;
  orderId: string;
}) {
  const { t } = useI18n();

  // Opened by a print button: go straight to the printer once the fonts have
  // loaded, so the first page out is not set in a fallback face.
  React.useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [auto]);

  const href = (next: { kind?: string; paper?: string }) =>
    `/print/order/${orderId}?kind=${next.kind ?? kind}&paper=${next.paper ?? paper}`;
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold",
      active ? "bg-ink-900 text-white" : "border border-ink-300 text-ink-700",
    );

  return (
    <div className="no-print mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 p-3">
      <Link href={href({ kind: "bill" })} className={chip(kind === "bill")}>
        {t.print.bill}
      </Link>
      <Link href={href({ kind: "ticket" })} className={chip(kind === "ticket")}>
        {t.print.ticket}
      </Link>
      <Link href={href({ paper: "80" })} className={chip(paper === "80")}>
        {t.print.paper80}
      </Link>
      <Link href={href({ paper: "58" })} className={chip(paper === "58")}>
        {t.print.paper58}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-xs font-bold text-white"
      >
        <Printer className="size-4" />
        {t.print.print}
      </button>
    </div>
  );
}
