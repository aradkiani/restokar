"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { localizeDigits } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
}

/**
 * The chain's suppliers. Everyone with the section sees them; only the owner
 * can add or retire one — a supplier is part of the catalogue, shared by every
 * branch. Retired rather than deleted, because old invoices name them.
 */
export function Suppliers({ rows, canEdit }: { rows: SupplierRow[]; canEdit: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const copy = t.stock;
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy("new");
    const result = await api.post("/api/inventory/suppliers", {
      name: name.trim(),
      phone: phone.trim() || undefined,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(copy.saved);
    setName("");
    setPhone("");
    router.refresh();
  }

  async function toggle(row: SupplierRow) {
    setBusy(row.id);
    const result = await api.patch(`/api/inventory/suppliers/${row.id}`, {
      name: row.name,
      phone: row.phone ?? undefined,
      note: row.note ?? undefined,
      isActive: !row.isActive,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.addSupplier}</CardTitle>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={add}
              className="grid gap-3 sm:grid-cols-[2fr_1.4fr_auto] sm:items-end"
              aria-label={copy.addSupplier}
            >
              <Field label={copy.supplierName} htmlFor="s-name">
                <Input
                  id="s-name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={copy.phone} hint={t.common.optional} htmlFor="s-phone">
                <Input
                  id="s-phone"
                  dir="ltr"
                  inputMode="tel"
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Button type="submit" loading={busy === "new"} disabled={!name.trim()}>
                {copy.addSupplier}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : (
        <p className="text-sm text-ink-500">{copy.ownerOnlySuppliers}</p>
      )}

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-surface">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-3",
              !row.isActive && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">
                {row.name}
                {!row.isActive && (
                  <span className="ms-2 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-600">
                    {copy.inactive}
                  </span>
                )}
              </p>
              {row.phone && (
                <p className="mt-0.5 text-xs text-ink-500" dir="ltr">
                  {localizeDigits(row.phone, locale)}
                </p>
              )}
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === row.id}
                onClick={() => toggle(row)}
              >
                {row.isActive ? copy.deactivate : copy.activate}
              </Button>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-ink-500">
            {copy.noSuppliers}
          </li>
        )}
      </ul>
    </div>
  );
}
