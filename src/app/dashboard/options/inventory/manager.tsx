"use client";

import * as React from "react";
import { AlertTriangle, Plus, Save, Trash2, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { Field, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { formatMoneyWithUnit, formatNumber, parseAmount } from "@/lib/format";
import { formatQuantity, fromMilli, isLowStock, parseQuantity } from "@/lib/inventory";
import { lineCost, recipeCost, unitCost, type PriceWarning } from "@/lib/costing";
import {
  DIMENSIONS,
  UNIT_CODES,
  compatibleUnits,
  dimensionOf,
  fromItemMilli,
  isUnitCode,
  toItemMilli,
  type UnitCode,
} from "@/lib/units";

interface Item {
  id: string;
  name: string;
  unit: string;
  quantityMilli: number;
  lowStockMilli: number;
  purchasePrice: number | null;
  priceUnit: string | null;
  /** Free-text group for the stock list. */
  categoryName: string | null;
  /** The usual supplier, from the inventory section's supplier list. */
  supplierId: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface RecipeLine {
  itemId: string;
  perUnitMilli: number;
  /** The unit the amount was typed in; null means the item's own unit. */
  unit: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  ingredients: RecipeLine[];
}

interface PriceChange {
  item: Item;
  repriced: { id: string; name: string; priceBefore: number; priceAfter: number }[];
  alerts: {
    id: string;
    name: string;
    warning: PriceWarning;
    marginPercent: number | null;
  }[];
  autoReprice: boolean;
}

const asUnit = (value: string | null | undefined): UnitCode =>
  isUnitCode(value) ? value : "piece";

/**
 * Ingredients, what they cost, and dish recipes.
 *
 * Quantities are typed in the owner's own unit and sent that way — the wire
 * carries 2.5, not 2500 — with `parseQuantity` handling Persian digits and
 * either decimal separator on the way in, the same trap the discount form hit.
 *
 * Units come from a catalogue (`units.ts`) rather than free text, which is what
 * lets a recipe say "230 grams" of flour kept in kilograms, and what lets a
 * purchase price of "45,000 per kilogram" cost that 230 g at 10,350.
 *
 * A purchase price change can move menu prices. The server does the moving;
 * this screen shows what moved, on the spot, because an owner who raised the
 * price of flour should see at once which dishes followed it.
 */
export function InventoryManager({
  initialItems,
  products,
  suppliers,
}: {
  initialItems: Item[];
  products: ProductRow[];
  suppliers: SupplierOption[];
}) {
  const { t, locale } = useI18n();
  const c = t.costing;
  const toast = useToast();

  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [recipes, setRecipes] = React.useState<Record<string, RecipeLine[]>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.ingredients])),
  );
  const [change, setChange] = React.useState<PriceChange | null>(null);

  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState<UnitCode>("kg");
  const [quantity, setQuantity] = React.useState("");
  const [lowStock, setLowStock] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [priceUnit, setPriceUnit] = React.useState<UnitCode>("kg");
  const [busy, setBusy] = React.useState(false);

  const [productId, setProductId] = React.useState(products[0]?.id ?? "");

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const purchasePrice = parseAmount(price);

    setBusy(true);
    const result = await api.post<Item>("/api/inventory", {
      name,
      unit,
      quantity: fromMilli(parseQuantity(quantity)),
      lowStock: fromMilli(parseQuantity(lowStock)),
      ...(purchasePrice > 0 ? { purchasePrice, priceUnit } : {}),
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    setItems((current) =>
      [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setName("");
    setQuantity("");
    setLowStock("");
    setPrice("");
  }

  async function saveField(item: Item, patch: Record<string, unknown>) {
    const result = await api.patch<PriceChange>(`/api/inventory/${item.id}`, patch);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    const next = result.data.item;
    setItems((current) => current.map((row) => (row.id === item.id ? next : row)));

    // A unit change rewrites every recipe amount for this item on the server;
    // mirror the conversion so the recipe editor reads back what is stored.
    if (next.unit !== item.unit) {
      const factor = fromItemMilli(1_000, asUnit(item.unit), asUnit(next.unit)) ?? 1;
      setRecipes((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, lines]) => [
            id,
            lines.map((line) =>
              line.itemId === item.id
                ? { ...line, perUnitMilli: Math.round(line.perUnitMilli * factor) }
                : line,
            ),
          ]),
        ),
      );
    }

    const priceMoved =
      next.purchasePrice !== item.purchasePrice || next.priceUnit !== item.priceUnit;
    if (priceMoved && item.purchasePrice !== null) setChange(result.data);
  }

  async function removeItem(item: Item) {
    if (!window.confirm(t.inventory.deleteConfirm)) return;
    const result = await api.del(`/api/inventory/${item.id}`);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    setItems((current) => current.filter((row) => row.id !== item.id));
    setRecipes((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, lines]) => [
          id,
          lines.filter((line) => line.itemId !== item.id),
        ]),
      ),
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t.inventory.title}</CardTitle>
          {/* Stock is a level rather than a flow, so this export carries no
              period — "inventory between the 1st and the 15th" has no answer. */}
          <ExportButton dataset="inventory" variant="ghost" />
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-6 text-ink-500">{t.inventory.hint}</p>

          <form onSubmit={addItem} className="grid gap-3 sm:grid-cols-3">
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
              <UnitSelect
                id="item-unit"
                value={unit}
                onChange={(next) => {
                  setUnit(next);
                  // The price is quoted per a unit of the same kind; follow the
                  // stock unit across a change of kind.
                  if (dimensionOf(next) !== dimensionOf(priceUnit)) setPriceUnit(next);
                }}
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

            <Field
              label={c.purchasePrice}
              hint={c.purchasePriceHint}
              htmlFor="item-price"
            >
              <MoneyInput
                id="item-price"
                value={parseAmount(price) || null}
                onValueChange={(amount) => setPrice(amount ? String(amount) : "")}
                className="font-bold tabular-nums"
              />
            </Field>

            <Field label={c.per} htmlFor="item-price-unit">
              <UnitSelect
                id="item-price-unit"
                value={priceUnit}
                options={compatibleUnits(unit)}
                onChange={setPriceUnit}
              />
            </Field>

            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>
                <Plus className="size-4" />
                {t.inventory.addItem}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {change && <PriceChangeNotice change={change} onDismiss={() => setChange(null)} />}

      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-ink-500">
              {t.inventory.noItems}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {items.map((item) => (
                <ItemRow
                  // Keyed on what is stored, so the uncontrolled inputs start
                  // from the saved values again after every save.
                  key={`${item.id}:${item.unit}:${item.quantityMilli}:${item.lowStockMilli}:${item.purchasePrice}:${item.priceUnit}:${item.categoryName}:${item.supplierId}`}
                  item={item}
                  suppliers={suppliers}
                  locale={locale}
                  onSave={(patch) => saveField(item, patch)}
                  onRemove={() => removeItem(item)}
                />
              ))}
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
                that dish's own amounts. `key` is React's own answer to "reset
                this state when its input changes", in place of an effect that
                re-syncs state — which this codebase treats as something to
                justify rather than reach for.
              */}
              <RecipeEditor
                key={productId}
                productId={productId}
                items={items}
                initial={recipes[productId] ?? []}
                onSaved={(lines) =>
                  setRecipes((current) => ({ ...current, [productId]: lines }))
                }
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

/** Units grouped by kind, so "grams" is never offered next to "litres" loosely. */
function UnitSelect({
  id,
  value,
  onChange,
  options = UNIT_CODES,
  ariaLabel,
  className,
}: {
  id?: string;
  value: UnitCode;
  onChange: (unit: UnitCode) => void;
  options?: readonly UnitCode[];
  ariaLabel?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const c = t.costing;

  return (
    <Select
      id={id}
      value={value}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => onChange(asUnit(e.target.value))}
    >
      {DIMENSIONS.map((dimension) => {
        const units = options.filter((code) => dimensionOf(code) === dimension);
        if (units.length === 0) return null;
        return (
          <optgroup key={dimension} label={c.dimensions[dimension]}>
            {units.map((code) => (
              <option key={code} value={code}>
                {c.units[code]}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}

function ItemRow({
  item,
  suppliers,
  locale,
  onSave,
  onRemove,
}: {
  item: Item;
  suppliers: SupplierOption[];
  locale: ReturnType<typeof useI18n>["locale"];
  onSave: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const c = t.costing;
  const low = isLowStock(item);
  const unit = asUnit(item.unit);
  const priceUnit = asUnit(item.priceUnit ?? item.unit);
  const perUnit = unitCost(item);
  // The price being typed; saved when the field is left, as before.
  const [priceDraft, setPriceDraft] = React.useState<number | null>(item.purchasePrice);

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
          {item.name}
        </span>

        {low && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
            <AlertTriangle className="size-3" />
            {t.inventory.lowBadge}
          </span>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`${t.common.delete} ${item.name}`}
          className="tap-safe grid size-11 place-items-center rounded-full text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] font-semibold text-ink-500">
          {t.inventory.quantity}
          <input
            defaultValue={formatQuantity(item.quantityMilli)}
            onBlur={(e) => {
              const next = fromMilli(parseQuantity(e.target.value));
              if (next !== fromMilli(item.quantityMilli)) onSave({ quantity: next });
            }}
            inputMode="decimal"
            className={cn(
              "mt-1 h-11 w-full rounded-[var(--radius-sm)] border bg-surface px-2 text-center text-sm font-bold text-ink-900 tabular-nums",
              low ? "border-amber-400" : "border-ink-200",
            )}
          />
        </label>

        <label className="text-[11px] font-semibold text-ink-500">
          {t.inventory.itemUnit}
          <UnitSelect
            value={unit}
            className="mt-1"
            onChange={(next) => {
              if (next !== unit) onSave({ unit: next });
            }}
          />
        </label>

        <label className="text-[11px] font-semibold text-ink-500">
          {t.inventory.lowStock}
          <input
            defaultValue={formatQuantity(item.lowStockMilli)}
            onBlur={(e) => {
              const next = fromMilli(parseQuantity(e.target.value));
              if (next !== fromMilli(item.lowStockMilli)) onSave({ lowStock: next });
            }}
            inputMode="decimal"
            className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-2 text-center text-sm font-semibold text-ink-700 tabular-nums"
          />
        </label>

        <div className="text-[11px] font-semibold text-ink-500">
          {c.purchasePrice}
          <div className="mt-1 flex gap-1">
            <MoneyInput
              value={priceDraft}
              onValueChange={setPriceDraft}
              onBlur={() => {
                const next = priceDraft && priceDraft > 0 ? priceDraft : null;
                if (next !== item.purchasePrice) {
                  onSave(
                    next === null
                      ? { purchasePrice: null, priceUnit: null }
                      : { purchasePrice: next, priceUnit },
                  );
                }
              }}
              aria-label={`${c.purchasePrice} — ${item.name}`}
              className="min-w-0 flex-1 px-2 text-center font-bold text-ink-900 tabular-nums"
            />
            <UnitSelect
              value={priceUnit}
              options={compatibleUnits(unit)}
              ariaLabel={`${c.per} — ${item.name}`}
              className="w-28 shrink-0"
              onChange={(next) => {
                if (item.purchasePrice !== null && next !== item.priceUnit) {
                  onSave({ purchasePrice: item.purchasePrice, priceUnit: next });
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Where it sits in the stock list, and who usually supplies it. */}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold text-ink-500">
          {t.stock.category}
          <input
            defaultValue={item.categoryName ?? ""}
            maxLength={40}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== (item.categoryName ?? "")) onSave({ categoryName: next });
            }}
            className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-2 text-sm font-semibold text-ink-700"
          />
        </label>
        <label className="text-[11px] font-semibold text-ink-500">
          {t.stock.supplier}
          <Select
            value={item.supplierId ?? ""}
            onChange={(e) => onSave({ supplierId: e.target.value || null })}
            className="mt-1"
          >
            <option value="">{t.stock.noSupplier}</option>
            {suppliers
              .filter((s) => s.isActive || s.id === item.supplierId)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </Select>
        </label>
      </div>

      <p className="text-[11px] text-ink-500 tabular-nums">
        {perUnit === null
          ? c.notPriced
          : c.unitCost
              .replace("{unit}", c.units[unit])
              .replace("{cost}", formatMoneyWithUnit(perUnit, locale))}
      </p>
    </li>
  );
}

/** What a purchase price change did to the menu, shown where it was made. */
function PriceChangeNotice({
  change,
  onDismiss,
}: {
  change: PriceChange;
  onDismiss: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.costing;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <TrendingUp className="size-4 text-brand-600" />
            {change.autoReprice
              ? c.repriced.replace("{n}", formatNumber(change.repriced.length, locale))
              : c.repriceOff}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t.common.close}
            className="tap-safe grid size-9 place-items-center rounded-full text-ink-400 hover:bg-ink-100"
          >
            <X className="size-4" />
          </button>
        </div>

        {change.repriced.length > 0 && (
          <ul className="space-y-1 text-xs text-ink-700 tabular-nums">
            {change.repriced.map((row) => (
              <li key={row.id}>
                {c.repricedRow
                  .replace("{name}", row.name)
                  .replace("{before}", formatMoneyWithUnit(row.priceBefore, locale))
                  .replace("{after}", formatMoneyWithUnit(row.priceAfter, locale))}
              </li>
            ))}
          </ul>
        )}

        {change.alerts.length > 0 && (
          <div className="rounded-[var(--radius-sm)] bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <p className="mb-1 font-bold">{c.alertsTitle}</p>
            <ul className="space-y-0.5">
              {change.alerts.map((alert) => (
                <li key={alert.id}>
                  {alert.warning === "BELOW_COST"
                    ? c.alertBelowCost.replace("{name}", alert.name)
                    : c.alertLowMargin
                        .replace("{name}", alert.name)
                        .replace(
                          "{margin}",
                          formatNumber(alert.marginPercent ?? 0, locale),
                        )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ recipes

interface DraftLine {
  amount: string;
  unit: UnitCode;
}

/**
 * The per-dish amounts, owning their own draft state.
 *
 * Mounted fresh for each dish via `key`, so the fields always start from what
 * that dish actually consumes and no synchronising effect is needed.
 *
 * Each amount can be typed in any unit of the ingredient's kind — 230 g of a
 * kilogram item — and is converted with the same `toItemMilli` the server uses,
 * so a line the server would refuse is marked here before anything is sent.
 * The dish's ingredient cost is shown live from the same `costing.ts` rules.
 */
function RecipeEditor({
  productId,
  items,
  initial,
  onSaved,
}: {
  productId: string;
  items: Item[];
  initial: RecipeLine[];
  onSaved: (lines: RecipeLine[]) => void;
}) {
  const { t, locale } = useI18n();
  const c = t.costing;
  const toast = useToast();

  const [draft, setDraft] = React.useState<Record<string, DraftLine>>(() => {
    const seeded: Record<string, DraftLine> = {};
    for (const line of initial) {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) continue;
      const itemUnit = asUnit(item.unit);
      const shownUnit = isUnitCode(line.unit) ? line.unit : itemUnit;
      const amount = fromItemMilli(line.perUnitMilli, itemUnit, shownUnit) ?? 0;
      seeded[line.itemId] = {
        amount: String(Number(amount.toFixed(3))),
        unit: shownUnit,
      };
    }
    return seeded;
  });
  const [saving, setSaving] = React.useState(false);

  // Each typed line, as it would be stored — or a marker that it cannot be.
  const converted = items.map((item) => {
    const line = draft[item.id];
    const itemUnit = asUnit(item.unit);
    if (!line || !line.amount.trim()) return { item, milli: null, invalid: false };

    const amount = fromMilli(parseQuantity(line.amount));
    if (!(amount > 0)) return { item, milli: null, invalid: false };

    const milli = toItemMilli(amount, line.unit, itemUnit);
    return { item, milli, invalid: milli === null };
  });

  const lines = converted
    .filter((row) => row.milli !== null)
    .map((row) => ({ itemId: row.item.id, perUnitMilli: row.milli! }));
  const invalid = converted.filter((row) => row.invalid);

  const cost = recipeCost(lines, new Map(items.map((item) => [item.id, item])));
  const unpricedNames = cost.unpricedItemIds
    .map((id) => items.find((item) => item.id === id)?.name)
    .filter(Boolean)
    .join("، ");

  async function save() {
    if (invalid.length > 0) {
      toast.error(c.recipeAmountInvalid.replace("{name}", invalid[0]!.item.name));
      return;
    }

    setSaving(true);
    const ingredients = items
      .map((item) => {
        const line = draft[item.id];
        const amount = line ? fromMilli(parseQuantity(line.amount)) : 0;
        return { itemId: item.id, amount, unit: line?.unit ?? asUnit(item.unit) };
      })
      // A blank or zero row means "this dish does not use it" — an absence
      // rather than a line that consumes nothing.
      .filter((line) => line.amount > 0);

    const result = await api.put(`/api/products/${productId}/ingredients`, {
      ingredients,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    onSaved(
      ingredients.map((line) => {
        const item = items.find((i) => i.id === line.itemId)!;
        const itemUnit = asUnit(item.unit);
        return {
          itemId: line.itemId,
          perUnitMilli: toItemMilli(line.amount, line.unit, itemUnit) ?? 0,
          unit: line.unit === itemUnit ? null : line.unit,
        };
      }),
    );
    toast.success(t.inventory.recipeSaved);
  }

  return (
    <>
      <ul className="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-100">
        {converted.map(({ item, milli, invalid: bad }) => {
          const itemUnit = asUnit(item.unit);
          const line = draft[item.id] ?? { amount: "", unit: itemUnit };
          const cost = milli === null ? null : lineCost(milli, item);

          return (
            <li key={item.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {item.name}
              </span>
              <input
                value={line.amount}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    [item.id]: { ...line, amount: e.target.value },
                  }))
                }
                inputMode="decimal"
                placeholder="۰"
                aria-label={`${t.inventory.perUnit} — ${item.name}`}
                aria-invalid={bad || undefined}
                className={cn(
                  "h-11 w-20 rounded-[var(--radius-sm)] border bg-surface px-2 text-center text-sm font-bold tabular-nums",
                  bad ? "border-red-400" : "border-ink-200",
                )}
              />
              <UnitSelect
                value={line.unit}
                options={compatibleUnits(itemUnit)}
                ariaLabel={`${c.recipeUnit} — ${item.name}`}
                className="w-32"
                onChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    [item.id]: { ...line, unit: next },
                  }))
                }
              />
              <span className="w-24 text-end text-[11px] text-ink-500 tabular-nums">
                {cost === null ? "" : formatMoneyWithUnit(cost, locale)}
              </span>
            </li>
          );
        })}
      </ul>

      {lines.length > 0 && (
        <div className="space-y-1 text-xs">
          <p className="font-bold text-ink-800 tabular-nums">
            {c.recipeCost.replace("{cost}", formatMoneyWithUnit(cost.cost, locale))}
          </p>
          {!cost.complete && unpricedNames && (
            <p className="text-amber-700">
              {c.recipeIncomplete.replace("{items}", unpricedNames)}
            </p>
          )}
        </div>
      )}

      {invalid.length > 0 && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {c.recipeAmountInvalid.replace("{name}", invalid[0]!.item.name)}
        </p>
      )}

      <Button type="button" onClick={save} disabled={saving}>
        <Save className="size-4" />
        {t.inventory.saveRecipe}
      </Button>
    </>
  );
}
