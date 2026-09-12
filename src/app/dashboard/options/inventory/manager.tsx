"use client";

import * as React from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { formatQuantity, fromMilli, isLowStock, parseQuantity } from "@/lib/inventory";

interface Item {
  id: string;
  name: string;
  unit: string;
  quantityMilli: number;
  lowStockMilli: number;
}

interface ProductRow {
  id: string;
  name: string;
  ingredients: { itemId: string; perUnitMilli: number }[];
}

/**
 * Ingredients and dish recipes.
 *
 * Quantities are typed in the owner's own unit and sent that way — the wire
 * carries 2.5, not 2500 — with `parseQuantity` handling Persian digits and
 * either decimal separator on the way in, the same trap the discount form hit.
 */
export function InventoryManager({
  initialItems,
  products,
}: {
  initialItems: Item[];
  products: ProductRow[];
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [lowStock, setLowStock] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [productId, setProductId] = React.useState(products[0]?.id ?? "");
  const selected = products.find((p) => p.id === productId);

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !unit.trim()) return;

    setBusy(true);
    const result = await api.post("/api/inventory", {
      name,
      unit,
      quantity: fromMilli(parseQuantity(quantity)),
      lowStock: fromMilli(parseQuantity(lowStock)),
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    setItems((current) =>
      [...current, result.data as Item].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setName("");
    setUnit("");
    setQuantity("");
    setLowStock("");
  }

  async function saveField(item: Item, patch: Record<string, number>) {
    const result = await api.patch(`/api/inventory/${item.id}`, patch);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setItems((current) =>
      current.map((row) => (row.id === item.id ? (result.data as Item) : row)),
    );
  }

  async function removeItem(item: Item) {
    if (!window.confirm(t.inventory.deleteConfirm)) return;
    const result = await api.del(`/api/inventory/${item.id}`);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setItems((current) => current.filter((row) => row.id !== item.id));
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t.inventory.title}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-6 text-ink-500">{t.inventory.hint}</p>

          <form onSubmit={addItem} className="grid gap-3 sm:grid-cols-4">
            <Field label={t.inventory.itemName} htmlFor="item-name">
              <input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
              />
            </Field>

            <Field
              label={t.inventory.itemUnit}
              hint={t.inventory.unitHint}
              htmlFor="item-unit"
            >
              <input
                id="item-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
              />
            </Field>

            <Field label={t.inventory.quantity} htmlFor="item-qty">
              <input
                id="item-qty"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-bold"
              />
            </Field>

            <Field
              label={t.inventory.lowStock}
              hint={t.inventory.lowStockHint}
              htmlFor="item-low"
            >
              <input
                id="item-low"
                value={lowStock}
                onChange={(e) => setLowStock(e.target.value)}
                inputMode="decimal"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-bold"
              />
            </Field>

            <div className="sm:col-span-4">
              <Button type="submit" disabled={busy}>
                <Plus className="size-4" />
                {t.inventory.addItem}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-ink-500">
              {t.inventory.noItems}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {items.map((item) => {
                const low = isLowStock(item);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 p-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
                      {item.name}
                      <span className="ms-2 text-xs font-semibold text-ink-400">
                        {item.unit}
                      </span>
                    </span>

                    {low && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                        <AlertTriangle className="size-3" />
                        {t.inventory.lowBadge}
                      </span>
                    )}

                    <input
                      defaultValue={formatQuantity(item.quantityMilli)}
                      onBlur={(e) =>
                        saveField(item, {
                          quantity: fromMilli(parseQuantity(e.target.value)),
                        })
                      }
                      inputMode="decimal"
                      aria-label={`${t.inventory.quantity} — ${item.name}`}
                      className={cn(
                        "h-11 w-24 rounded-[var(--radius-sm)] border bg-surface px-2 text-center text-sm font-bold tabular-nums",
                        low ? "border-amber-400" : "border-ink-200",
                      )}
                    />

                    <input
                      defaultValue={formatQuantity(item.lowStockMilli)}
                      onBlur={(e) =>
                        saveField(item, {
                          lowStock: fromMilli(parseQuantity(e.target.value)),
                        })
                      }
                      inputMode="decimal"
                      aria-label={`${t.inventory.lowStock} — ${item.name}`}
                      className="h-11 w-20 rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-2 text-center text-sm font-semibold text-ink-500 tabular-nums"
                    />

                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      aria-label={`${t.common.delete} ${item.name}`}
                      className="tap-safe grid size-11 place-items-center rounded-full text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.inventory.recipeTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-6 text-ink-500">{t.inventory.recipeHint}</p>

          {items.length === 0 || products.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-ink-500">
              {t.inventory.noItemsForRecipe}
            </p>
          ) : (
            <>
              <Field label={t.inventory.pickProduct} htmlFor="recipe-product">
                <Select
                  id="recipe-product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {/*
                Keyed by dish, so choosing another one rebuilds this editor with
                that dish's own amounts.

                The obvious alternative — holding the amounts in the parent and
                re-syncing them in an effect whenever the selection changes — is
                a `setState` inside `useEffect`, which this codebase treats as
                something to justify rather than reach for. `key` is React's own
                answer to "reset this state when its input changes".
              */}
              <RecipeEditor
                key={productId}
                productId={productId}
                items={items}
                initial={selected?.ingredients ?? []}
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * The per-dish amounts, owning their own draft state.
 *
 * Mounted fresh for each dish via `key`, so the fields always start from what
 * that dish actually consumes and no synchronising effect is needed.
 */
function RecipeEditor({
  productId,
  items,
  initial,
}: {
  productId: string;
  items: Item[];
  initial: { itemId: string; perUnitMilli: number }[];
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [amounts, setAmounts] = React.useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const line of initial) seeded[line.itemId] = formatQuantity(line.perUnitMilli);
    return seeded;
  });
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const ingredients = Object.entries(amounts)
      .map(([itemId, value]) => ({ itemId, perUnit: fromMilli(parseQuantity(value)) }))
      // A blank or zero row means "this dish does not use it" — an absence
      // rather than a line that consumes nothing.
      .filter((line) => line.perUnit > 0);

    const result = await api.put(`/api/products/${productId}/ingredients`, {
      ingredients,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t.inventory.recipeSaved);
  }

  return (
    <>
      <ul className="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 p-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {item.name}
              <span className="ms-2 text-xs text-ink-400">{item.unit}</span>
            </span>
            <input
              value={amounts[item.id] ?? ""}
              onChange={(e) =>
                setAmounts((current) => ({ ...current, [item.id]: e.target.value }))
              }
              inputMode="decimal"
              placeholder="۰"
              aria-label={`${t.inventory.perUnit} — ${item.name}`}
              className="h-11 w-24 rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-2 text-center text-sm font-bold tabular-nums"
            />
          </li>
        ))}
      </ul>

      <Button type="button" onClick={save} disabled={saving}>
        <Save className="size-4" />
        {t.inventory.saveRecipe}
      </Button>
    </>
  );
}
