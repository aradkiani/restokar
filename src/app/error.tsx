"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  React.useEffect(() => {
    // The digest is the only safe correlation handle to surface — the message
    // itself may carry internal detail.
    console.error("[app] render error", error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-red-100 text-red-700">
          <TriangleAlert className="size-8" />
        </span>
        <h1 className="mt-6 text-2xl font-black text-ink-900">{t.errors.serverError}</h1>
        <p className="mt-2 text-sm leading-8 text-ink-600">{t.errors.serverErrorHint}</p>

        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-ink-400" dir="ltr">
            {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-7 inline-flex h-12 items-center rounded-full bg-ink-900 px-7 text-sm font-bold text-white transition-colors hover:bg-ink-800"
        >
          {t.common.retry}
        </button>
      </div>
    </main>
  );
}
