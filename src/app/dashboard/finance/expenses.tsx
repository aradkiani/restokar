"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { RankedBars } from "@/components/charts";
import { api } from "@/lib/client-api";
import { formatDate, formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/validation";
import type { Locale } from "@/lib/i18n";

export interface ExpenseRow {
  id: string;
  title: string;
  category: string;
  amount: number;
  note: string | null;
  occurredAt: string;
  isRecurring: boolean;
}

/** Today in yyyy-mm-dd, for the date input's default. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * An ISO timestamp as the yyyy-mm-dd a `<input type="date">` expects.
 *
 * Built from the local calendar fields rather than by slicing the ISO string:
 * `2026-08-16T21:00:00Z` sliced gives 16 August, but in Tehran that instant is
 * already the 17th, so reopening an expense would silently move its date back a
 * day every time it was edited.
 */
function toDateInput(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function ExpensesPanel({
  locale,
  initialExpenses,
  byCategory,
}: {
  locale: Locale;
  initialExpenses: ExpenseRow[];
  byCategory: { category: string; amount: number }[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  /** Null when adding; the expense's id when correcting an existing one. */
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    title: "",
    category: "rent" as (typeof EXPENSE_CATEGORIES)[number],
    amount: 0,
    note: "",
    occurredAt: todayIso(),
    isRecurring: false,
  });

  const blankForm = () => ({
    title: "",
    category: "rent" as (typeof EXPENSE_CATEGORIES)[number],
    amount: 0,
    note: "",
    occurredAt: todayIso(),
    isRecurring: false,
  });

  function startAdding() {
    setEditingId(null);
    setForm(blankForm());
    setOpen(true);
  }

  /**
   * Costs are corrected far more often than they are deleted: a rent figure was
   * an estimate, a supplier invoice came in higher, a wage bill changed. Before
   * this the only way to fix an amount was to delete the row and retype it,
   * which loses the original date and quietly rewrites history.
   */
  function startEditing(expense: ExpenseRow) {
    setEditingId(expense.id);
    setForm({
      title: expense.title,
      category: expense.category as (typeof EXPENSE_CATEGORIES)[number],
      amount: expense.amount,
      note: expense.note ?? "",
      // The stored value is an ISO timestamp; the date input wants yyyy-mm-dd
      // in local time, and slicing the ISO string would shift the day for
      // anyone east of UTC.
      occurredAt: toDateInput(expense.occurredAt),
      isRecurring: expense.isRecurring,
    });
    setOpen(true);
  }

  const categoryLabel = (key: string) =>
    t.finance.categories[key as keyof typeof t.finance.categories] ?? key;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      // An emptied note must clear the stored one, so it is sent as "" rather
      // than dropped — `undefined` would leave the old text in place.
      note: editingId ? form.note : form.note || undefined,
      // The date input gives a bare yyyy-mm-dd; anchor it to local midnight.
      occurredAt: new Date(`${form.occurredAt}T00:00:00`).toISOString(),
    };

    const result = editingId
      ? await api.patch(`/api/expenses/${editingId}`, payload)
      : await api.post("/api/expenses", payload);

    setSaving(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    toast.success(t.common.saved);
    setOpen(false);
    setEditingId(null);
    setForm(blankForm());
    router.refresh();
  }

  async function handleDelete(id: string) {
    const result = await api.del(`/api/expenses/${id}`);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.expenses}</CardTitle>
          <Button size="sm" onClick={startAdding}>
            <Plus className="size-4" />
            {t.finance.addExpense}
          </Button>
        </CardHeader>

        <CardBody className="space-y-5">
          {byCategory.length > 0 && (
            <RankedBars
              locale={locale}
              colorful
              emptyLabel={t.finance.noExpenses}
              data={byCategory.map((row) => ({
                label: categoryLabel(row.category),
                value: row.amount,
              }))}
            />
          )}

          {initialExpenses.length === 0 ? (
            <EmptyState title={t.finance.noExpenses} />
          ) : (
            <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto">
              {initialExpenses.map((expense) => (
                <li key={expense.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {expense.title}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {categoryLabel(expense.category)} ·{" "}
                      {formatDate(expense.occurredAt, locale)}
                      {expense.isRecurring && ` · ${t.finance.recurring}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink-900 tabular-nums">
                    {formatMoney(expense.amount, locale)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditing(expense)}
                    aria-label={`${t.common.edit} ${expense.title}`}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-brand-700"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(expense.id)}
                    aria-label={`${t.common.delete} ${expense.title}`}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingId(null);
        }}
        title={editingId ? t.finance.editExpense : t.finance.addExpense}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t.finance.expenseTitle} htmlFor="e-title">
            <Input
              id="e-title"
              required
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="اجاره مهرماه"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.finance.expenseCategory} htmlFor="e-category">
              <Select
                id="e-category"
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as (typeof EXPENSE_CATEGORIES)[number],
                  })
                }
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t.finance.expenseAmount} htmlFor="e-amount">
              <MoneyInput
                id="e-amount"
                required
                value={form.amount}
                onValueChange={(amount) => setForm({ ...form, amount: amount ?? 0 })}
              />
            </Field>
          </div>

          <Field label={t.finance.expenseDate} htmlFor="e-date">
            <Input
              id="e-date"
              type="date"
              dir="ltr"
              required
              value={form.occurredAt}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            />
          </Field>

          <Field label={t.finance.expenseNote} hint={t.common.optional} htmlFor="e-note">
            <Textarea
              id="e-note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>

          <Toggle
            checked={form.isRecurring}
            onChange={(v) => setForm({ ...form, isRecurring: v })}
            label={t.finance.recurring}
          />

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={saving}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
