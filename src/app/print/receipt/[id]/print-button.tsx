"use client";

import { Printer } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

/** The one control on the receipt; hidden from the printout itself. */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <div className="no-print" style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-5 text-sm font-bold text-ink-50"
      >
        <Printer className="size-4" aria-hidden />
        {t.receipt.print}
      </button>
    </div>
  );
}
