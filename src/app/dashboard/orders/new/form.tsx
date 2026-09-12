"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

interface ProductRow {
  id: string;
  name: string;
  price: number;
  needsChoices: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  products: ProductRow[];
}

/**
 * A counter-side order pad.
 *
 * The total shown here is an estimate of the line prices only — tax, service
 * charge, rounding and any discount are computed by the server when the order
 * is placed, from the same rules a guest's basket goes through. Reproducing
 * that arithmetic in this form would be a second implementation of the one
 * calculation that decides what a customer is charged.
 */
export function ManualOrderForm({ categories }: { categories: CategoryRow[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [lines, setLines] = React.useState<Record<string, number>>({});
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [tableNumber, setTableNumber] = React.useState("");
  const [note, setNote] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"CASH_ON_SITE" | "ONLINE">(
    "CASH_ON_SITE",
  );
  const [busy, setBusy] = React.useState(false);

  const byId = React.useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const category of categories) {
      for (const product of category.products) map.set(product.id, product);
    }
    return map;
  }, [categories]);

  const basket = Object.entries(lines).filter(([, qty]) => qty > 0);
  const estimate = basket.reduce(
    (sum, [id, qty]) => sum + (byId.get(id)?.price ?? 0) * qty,
    0,
  );

  function bump(productId: string, delta: number) {
    setLines((current) => {
      const next = Math.max(0, Math.min(99, (current[productId] ?? 0) + delta));
      return { ...current, [productId]: next };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (basket.length === 0) return;

    setBusy(true);
    const result = await api.post("/api/orders/manual", {
      customerName,
      customerPhone: customerPhone.trim() || undefined,
      tableNumber,
      note: note.trim() || undefined,
      paymentMethod,
      items: basket.map(([productId, quantity]) => ({ productId, quantity })),
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    toast.success(t.manualOrder.placed);
    // Back to the board, where the order it just created is now sitting.
    router.push("/dashboard/orders");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-start"
    >
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{t.manualOrder.products}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            {categories.map((category) => (
              <div key={category.id}>
                <p className="mb-2 text-sm font-black text-ink-800">{category.name}</p>
                <ul className="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-100">
                  {category.products.map((product) => {
                    const qty = lines[product.id] ?? 0;
                    return (
                      // No `aria-disabled`: a list item has no disabled state to
                      // announce, and the reason this dish cannot be added is
                      // written out below its name where a reader will meet it.
                      <li key={product.id} className="flex items-center gap-3 p-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {product.name}
                          </span>
                          {product.needsChoices ? (
                            <span className="block text-[11px] leading-5 text-amber-700">
                              {t.manualOrder.optionsUnsupported}
                            </span>
                          ) : (
                            <span className="block text-xs text-ink-500 tabular-nums">
                              {formatMoney(product.price, locale)}
                            </span>
                          )}
                        </span>

                        {!product.needsChoices && (
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => bump(product.id, -1)}
                              disabled={qty === 0}
                              aria-label={`−1 ${product.name}`}
                              className="tap-safe grid size-11 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-40"
                            >
                              <Minus className="size-4" />
                            </button>
                            <span
                              className={cn(
                                "w-8 text-center text-sm font-black tabular-nums",
                                // ink-300 is a *border* step, not a text one: it
                                // reads at 1.5:1 on paper and 2.1:1 on a dark
                                // card. ink-400 still says "nothing chosen yet"
                                // without making the zero unreadable.
                                qty === 0 && "text-ink-400",
                              )}
                            >
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => bump(product.id, 1)}
                              aria-label={`+1 ${product.name}`}
                              className="tap-safe grid size-11 place-items-center rounded-full text-ink-600 transition-colors hover:bg-ink-100"
                            >
                              <Plus className="size-4" />
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4" />
              {t.manualOrder.title}
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs leading-6 text-ink-500">{t.manualOrder.hint}</p>

            <Field label={t.manualOrder.customerName} htmlFor="mo-name">
              <input
                id="mo-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
              />
            </Field>

            <Field label={t.manualOrder.customerPhone} htmlFor="mo-phone">
              <input
                id="mo-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                dir="ltr"
                inputMode="tel"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
              />
            </Field>

            <Field
              label={t.manualOrder.tableNumber}
              hint={t.manualOrder.tableHint}
              htmlFor="mo-table"
            >
              <input
                id="mo-table"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                required
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
              />
            </Field>

            <Field label={t.manualOrder.note} htmlFor="mo-note">
              <textarea
                id="mo-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface p-3 text-sm leading-7"
              />
            </Field>

            <Field label={t.manualOrder.paymentMethod} htmlFor="mo-payment">
              <Select
                id="mo-payment"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as "CASH_ON_SITE" | "ONLINE")
                }
              >
                <option value="CASH_ON_SITE">{t.manualOrder.cash}</option>
                <option value="ONLINE">{t.manualOrder.online}</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-black text-ink-800">{t.manualOrder.basket}</p>

            {basket.length === 0 ? (
              <p className="py-4 text-center text-xs font-semibold text-ink-400">
                {t.manualOrder.emptyBasket}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {basket.map(([id, qty]) => (
                  <li key={id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {byId.get(id)?.name}
                    </span>
                    <span className="text-ink-400 tabular-nums">×{qty}</span>
                    <span className="font-bold tabular-nums">
                      {formatMoney((byId.get(id)?.price ?? 0) * qty, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-ink-100 pt-3">
              <span className="text-xs font-semibold text-ink-500">
                {t.manualOrder.total}
              </span>
              <span className="text-sm font-black tabular-nums">
                {formatMoney(estimate, locale)}
              </span>
            </div>

            <Button
              type="submit"
              disabled={busy || basket.length === 0}
              className="w-full"
            >
              {t.manualOrder.place}
            </Button>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
