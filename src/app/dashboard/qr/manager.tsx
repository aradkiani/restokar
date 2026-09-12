"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  Plus,
  Printer,
  QrCode,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { QrImage, downloadQr, downloadQrSvg } from "@/components/qr-code";
import { api } from "@/lib/client-api";
import { localizeDigits, parseAmount } from "@/lib/format";

export interface TableRow {
  id: string;
  number: string;
  label: string | null;
  seats: number | null;
}

export function QrManager({
  baseUrl,
  isLocalUrl,
  restaurant,
  initialTables,
}: {
  baseUrl: string;
  /** True when the configured origin only resolves on this machine. */
  isLocalUrl: boolean;
  restaurant: { slug: string; name: string; logoUrl: string | null };
  initialTables: TableRow[];
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [addOpen, setAddOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [form, setForm] = React.useState({ number: "", label: "", seats: "" });

  /*
   * The slug is percent-encoded because Iranian venues legitimately choose
   * Persian slugs («سنتی-حشمت»). Raw non-ASCII in a QR payload is decoded
   * differently by different scanner apps — several hand the browser mojibake —
   * so the code carries the same encoded form the address bar would produce.
   * decodeSlug() on the server turns it back before the lookup.
   */
  const menuUrl = `${baseUrl}/menu/${encodeURIComponent(restaurant.slug)}`;
  // The table travels in the QR link, so a guest never types it and the order
  // is tagged to the right table automatically.
  const tableUrl = (number: string) => `${menuUrl}?table=${encodeURIComponent(number)}`;

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const seats = parseAmount(form.seats);
    const result = await api.post("/api/tables", {
      number: form.number.trim(),
      label: form.label || undefined,
      seats: seats > 0 ? seats : null,
    });

    setSaving(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    toast.success(t.common.saved);
    setForm({ number: "", label: "", seats: "" });
    setAddOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const result = await api.del(`/api/tables/${deleteId}`);
    setDeleteId(null);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    router.refresh();
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t.common.error);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t.qr.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{t.qr.subtitle}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t.qr.printAll}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            {t.qr.addTable}
          </Button>
        </div>
      </header>

      {/*
        Printing is irreversible in a way almost nothing else in the product is:
        the address is encoded into the image, so a code printed against a local
        address is landfill. The warning sits above the codes rather than beside
        the print button, because it has to be read before the decision.
      */}
      {isLocalUrl && (
        <div
          role="alert"
          className="no-print rounded-[var(--radius-md)] border border-red-300 bg-red-50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-red-900">
            <TriangleAlert className="size-4 shrink-0" />
            {t.qr.localUrlWarning}
          </p>
          <p className="mt-1.5 text-xs leading-6 text-red-800">{t.qr.localUrlHint}</p>
        </div>
      )}

      {/* ----------------------------------------------------- menu address */}
      <Card className="no-print">
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-500">{t.qr.menuUrl}</p>
            <p
              className="mt-1 truncate font-mono text-sm font-bold text-brand-700"
              dir="ltr"
            >
              {menuUrl}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={copyUrl}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t.common.copied : t.common.copy}
          </Button>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- general QR */}
      <Card className="no-print">
        <CardHeader>
          <div>
            <CardTitle>{t.qr.generalQr}</CardTitle>
            <p className="mt-1 text-xs text-ink-500">{t.qr.generalQrHint}</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-5">
          <QrImage
            value={menuUrl}
            alt={t.qr.generalQr}
            className="size-36 rounded-[var(--radius-md)] border border-ink-200"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadQr(menuUrl, `${restaurant.slug}-menu.png`)}
            >
              <Download className="size-4" />
              {t.qr.downloadPng}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadQrSvg(menuUrl, `${restaurant.slug}-menu.svg`)}
            >
              <Download className="size-4" />
              {t.qr.downloadSvg}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------ table cards */}
      {initialTables.length === 0 ? (
        <Card className="no-print">
          <EmptyState
            icon={<QrCode className="size-6" />}
            title={t.qr.noTables}
            description={t.qr.subtitle}
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                {t.qr.addTable}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <h2 className="print-only mb-4 text-center text-xl font-black">
            {restaurant.name}
          </h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {initialTables.map((table) => (
              <article
                key={table.id}
                className="qr-card flex flex-col items-center rounded-[var(--radius-lg)] border border-ink-200 bg-surface p-4 text-center shadow-[var(--shadow-soft)]"
              >
                {/* Table number sits above the code — printed on the card and
                    encoded in the link, so both humans and scanners agree. */}
                <p className="text-xs font-semibold text-ink-500">{t.qr.tableNumber}</p>
                <p className="mb-2 text-3xl leading-none font-black text-ink-900 tabular-nums">
                  {localizeDigits(table.number, locale)}
                </p>
                {table.label && (
                  <p className="mb-2 text-xs font-semibold text-ink-600">{table.label}</p>
                )}

                <QrImage
                  // The encoded URL keeps the raw number — it is a real link a
                  // scanner has to resolve — while the alt text is localized.
                  value={tableUrl(table.number)}
                  alt={`${t.qr.tableNumber} ${localizeDigits(table.number, locale)}`}
                  className="w-full max-w-[160px] rounded-[var(--radius-sm)]"
                />

                <p className="mt-2 text-[11px] font-semibold text-ink-500">
                  {t.qr.scanHint}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-brand-700">
                  {restaurant.name}
                </p>

                <div className="no-print mt-3 flex w-full gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      downloadQr(
                        tableUrl(table.number),
                        `${restaurant.slug}-table-${table.number}.png`,
                      )
                    }
                    className="flex h-8 flex-1 items-center justify-center gap-1 rounded-[var(--radius-xs)] border border-ink-200 text-[11px] font-bold text-ink-700 hover:border-ink-300"
                  >
                    <Download className="size-3" />
                    PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(table.id)}
                    aria-label={`${t.common.delete} ${localizeDigits(table.number, locale)}`}
                    className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] border border-ink-200 text-ink-400 hover:border-red-300 hover:text-red-600"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t.qr.addTable}
        size="sm"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <Field label={t.qr.tableNumber} htmlFor="table-number">
            <Input
              id="table-number"
              required
              autoFocus
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              placeholder="12"
            />
          </Field>

          <Field label={t.qr.tableLabel} hint={t.qr.tableLabelHint} htmlFor="table-label">
            <Input
              id="table-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="تراس"
            />
          </Field>

          <Field label={t.qr.seats} hint={t.common.optional} htmlFor="table-seats">
            <Input
              id="table-seats"
              inputMode="numeric"
              value={form.seats}
              onChange={(e) => setForm({ ...form, seats: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={saving}>
              {t.common.add}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t.qr.deleteTableConfirm}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
      />
    </div>
  );
}
