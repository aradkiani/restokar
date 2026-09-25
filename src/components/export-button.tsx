"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import type { ExportDataset } from "@/lib/export/dataset-names";

/**
 * "Give me this report as a spreadsheet."
 *
 * Contextual by design — one of these sits on the report it exports, rather
 * than there being an export centre listing eight datasets an owner then has to
 * match against the screen they were just looking at. The flow is: look at a
 * report, set the filters, press export.
 *
 * ### Why it fetches rather than linking
 *
 * A plain `<a href>` would be simpler, and it is what the QR download does. It
 * is wrong here: the endpoint can legitimately answer 404 (nothing in this
 * period), 403 (not your data) or 429 (too many requests), and a link navigates
 * the browser to the JSON error body instead of telling the owner what
 * happened. Fetching lets the existing toast system say it in their language.
 *
 * The filename still comes from the server's `content-disposition`, so there is
 * one definition of what an export is called.
 */
export function ExportButton({
  dataset,
  days,
  from,
  to,
  variant = "outline",
}: {
  dataset: ExportDataset;
  /** Rolling window, matching the report's own range selector. */
  days?: number;
  /** Or an explicit range, for reports that use one. Both ends or neither. */
  from?: string;
  to?: string;
  variant?: "outline" | "ghost";
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function download() {
    setBusy(true);

    try {
      const params = new URLSearchParams({ dataset });
      if (from && to) {
        params.set("from", from);
        params.set("to", to);
      } else if (days) {
        params.set("days", String(days));
      }

      const response = await fetch(`/api/export?${params.toString()}`);

      if (!response.ok) {
        /*
          The server's own sentence where it sent one.

          `EXPORT_EMPTY` carries the translated "nothing in this period" text,
          which is more useful than a generic failure — and the status codes are
          distinguished so a permission problem does not read as a bug.
        */
        const body = await response.json().catch(() => null);
        const message =
          body?.error?.message ??
          (response.status === 403
            ? t.exports.forbidden
            : response.status === 429
              ? t.exports.tooMany
              : t.exports.failed);

        toast.error(message);
        return;
      }

      /*
        The filename the server chose, parsed out of `content-disposition`.

        Falling back to a sensible name rather than to `download` with no
        extension, which is what the browser does with an unnamed blob.
      */
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? `restokar-${dataset}.csv`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // The same download idiom `downloadQrSvg` already uses.
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);
    } catch {
      // A network failure, not a server answer. The generic sentence is the
      // honest one: nothing is known about why.
      toast.error(t.exports.failed);
    } finally {
      setBusy(false);
    }
  }

  /*
    Labelled by what it exports, not by "Export".

    Three of these sit together on the analytics page, and all reading «خروجی
    CSV» told an owner nothing about which one gave them product margins and
    which gave them order lines — at 320px they are three identical buttons in a
    row. The dataset name is the useful half; the download icon and the
    accessible name carry the "export CSV" part.
  */
  const label = t.exports.datasets[dataset];

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={busy}
      aria-label={`${t.exports.action} — ${label}`}
      onClick={() => void download()}
    >
      <Download className="size-4" aria-hidden />
      {busy ? t.exports.downloading : label}
    </Button>
  );
}
