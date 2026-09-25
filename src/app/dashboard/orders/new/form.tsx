"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, LayoutGrid, List, Minus, Plus, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  defaultSelection,
  missingRequiredGroups,
  selectedChoiceIds,
  toggleChoice,
  type OptionSelection,
} from "@/lib/order-options";

interface ChoiceRow {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

interface OptionGroupRow {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  choices: ChoiceRow[];
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  shortDescription: string | null;
  imageUrl: string | null;
  optionGroups: OptionGroupRow[];
}

interface CategoryRow {
  id: string;
  name: string;
  products: ProductRow[];
}

/**
 * One line of the pad's basket.
 *
 * A list rather than a quantity per product, because the same dish ordered two
 * ways is two lines — "one large, one small" is not a quantity of two. Keyed by
 * its own id for exactly that reason: the product id no longer identifies a
 * line on its own.
 */
interface OrderLine {
  lineId: string;
  productId: string;
  quantity: number;
  choiceIds: string[];
  /** Resolved once, for the basket summary; the server re-prices from its own rows. */
  label: string;
  unitPrice: number;
}

/** How the dishes are listed. Remembered per browser, not per venue. */
type BrowseMode = "list" | "menu";

const MODE_STORAGE_KEY = "restokar:manual-order-mode";

/** "Burger (large, no onion)" — what the basket line reads as. */
function labelFor(product: ProductRow, choiceIds: string[]): string {
  if (choiceIds.length === 0) return product.name;

  const chosen = product.optionGroups.flatMap((group) =>
    group.choices.filter((choice) => choiceIds.includes(choice.id)).map((c) => c.name),
  );

  return chosen.length ? `${product.name} (${chosen.join("، ")})` : product.name;
}

/**
 * The pad's estimate for one unit, base price plus the deltas chosen.
 *
 * An estimate only, and deliberately never sent: the server re-reads every
 * price and every delta from its own rows when the order is placed. This exists
 * so the person on the telephone can say what it comes to.
 */
function unitPriceFor(product: ProductRow, choiceIds: string[]): number {
  const deltas = product.optionGroups.flatMap((group) =>
    group.choices
      .filter((choice) => choiceIds.includes(choice.id))
      .map((choice) => choice.priceDelta),
  );

  return deltas.reduce((sum, delta) => sum + delta, product.price);
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
export function ManualOrderForm({
  categories,
  showPrices,
}: {
  categories: CategoryRow[];
  showPrices: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [mode, setMode] = React.useState<BrowseMode>("list");
  const [lines, setLines] = React.useState<OrderLine[]>([]);
  /** The dish whose options are being chosen, if any. */
  const [picking, setPicking] = React.useState<ProductRow | null>(null);
  const [selection, setSelection] = React.useState<OptionSelection>({});
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [tableNumber, setTableNumber] = React.useState("");
  const [note, setNote] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"CASH_ON_SITE" | "ONLINE">(
    "CASH_ON_SITE",
  );
  const [busy, setBusy] = React.useState(false);

  // Restore the last-used mode. Read once on mount rather than stored on the
  // venue: which view suits you is a property of the person and the screen
  // they are on, not of the restaurant.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === "menu" || saved === "list") setMode(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  function chooseMode(next: BrowseMode) {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  const byId = React.useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const category of categories) {
      for (const product of category.products) map.set(product.id, product);
    }
    return map;
  }, [categories]);

  const estimate = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  /** How many of this dish are on the pad, across however many variants. */
  function quantityOf(productId: string): number {
    return lines
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /**
   * Adds a dish, asking about its options first when it has any.
   *
   * A dish with no groups goes straight on, which keeps the plain +/− stepper
   * behaving exactly as it did. Anything with a group opens the picker — it is
   * the only place the question "chicken or beef?" can be answered, and the
   * server refuses an order that skipped a required one.
   */
  function addProduct(product: ProductRow) {
    if (product.optionGroups.length === 0) {
      bumpLine(product, [], 1);
      return;
    }
    setSelection(defaultSelection(product.optionGroups));
    setPicking(product);
  }

  /**
   * Adds to an existing identical line, or starts a new one.
   *
   * Identical means same dish and same choices, which is why the ids are
   * compared as a joined key rather than by reference — two lines assembled
   * separately must still merge if they describe the same thing.
   */
  function bumpLine(product: ProductRow, choiceIds: string[], delta: number) {
    const key = choiceIds.join(",");

    setLines((current) => {
      const at = current.findIndex(
        (line) => line.productId === product.id && line.choiceIds.join(",") === key,
      );

      if (at === -1) {
        if (delta <= 0) return current;
        return [
          ...current,
          {
            lineId: `${product.id}:${key}:${Date.now()}`,
            productId: product.id,
            quantity: Math.min(99, delta),
            choiceIds,
            label: labelFor(product, choiceIds),
            unitPrice: unitPriceFor(product, choiceIds),
          },
        ];
      }

      const next = [...current];
      const quantity = Math.max(0, Math.min(99, next[at]!.quantity + delta));
      // A line at zero is a line that is no longer on the order.
      if (quantity === 0) return next.filter((_, i) => i !== at);
      next[at] = { ...next[at]!, quantity };
      return next;
    });
  }

  /**
   * Takes one off the most recently added variant of a dish.
   *
   * The stepper beside a dish shows a total across its variants, so "−1" has to
   * pick one of them. The newest is the one just added, which is what someone
   * correcting a mis-tap means; removing a specific older variant is done from
   * the basket, where each line is listed separately.
   */
  function removeOne(product: ProductRow) {
    setLines((current) => {
      for (let i = current.length - 1; i >= 0; i--) {
        if (current[i]!.productId !== product.id) continue;
        const next = [...current];
        const quantity = next[i]!.quantity - 1;
        if (quantity === 0) return next.filter((_, at) => at !== i);
        next[i] = { ...next[i]!, quantity };
        return next;
      }
      return current;
    });
  }

  /** Commits the option picker's current answers. */
  function confirmOptions() {
    if (!picking) return;

    const missing = missingRequiredGroups(picking.optionGroups, selection);
    if (missing.length > 0) {
      // Named, rather than a generic "check the options": the person is on the
      // telephone and needs to know which question to ask.
      toast.error(`${t.manualOrder.chooseRequired} ${missing[0]!.name}`);
      return;
    }

    bumpLine(picking, selectedChoiceIds(picking.optionGroups, selection), 1);
    setPicking(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lines.length === 0) return;

    setBusy(true);
    const result = await api.post("/api/orders/manual", {
      customerName,
      customerPhone: customerPhone.trim() || undefined,
      tableNumber,
      note: note.trim() || undefined,
      paymentMethod,
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        // Ids only, exactly as the guest cart sends them. The server prices
        // them and refuses any the product does not offer.
        choiceIds: line.choiceIds.length ? line.choiceIds : undefined,
      })),
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
            {/*
              Two ways of reading the same dishes. The compact list is for
              someone who knows the menu and is typing fast; the menu view shows
              the photo and the description, which is what you need when the
              caller is describing a dish rather than naming it.
            */}
            <div
              role="group"
              aria-label={t.manualOrder.browseMode}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-ink-200 p-0.5"
            >
              <ModeButton
                active={mode === "list"}
                onClick={() => chooseMode("list")}
                icon={<List className="size-3.5" />}
                label={t.manualOrder.modeList}
              />
              <ModeButton
                active={mode === "menu"}
                onClick={() => chooseMode("menu")}
                icon={<LayoutGrid className="size-3.5" />}
                label={t.manualOrder.modeMenu}
              />
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            {categories.map((category) => (
              <div key={category.id}>
                <p className="mb-2 text-sm font-black text-ink-800">{category.name}</p>

                {mode === "list" ? (
                  <ul className="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-100">
                    {category.products.map((product) => (
                      <li key={product.id} className="flex items-center gap-3 p-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {product.name}
                          </span>
                          {showPrices && (
                            <span className="block text-xs text-ink-500 tabular-nums">
                              {formatMoney(product.price, locale)}
                            </span>
                          )}
                        </span>
                        <ProductAdder
                          product={product}
                          quantity={quantityOf(product.id)}
                          onAdd={() => addProduct(product)}
                          onRemove={() => removeOne(product)}
                          t={t}
                          locale={locale}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {category.products.map((product) => {
                      const qty = quantityOf(product.id);
                      return (
                        <li
                          key={product.id}
                          className="flex gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-surface p-2.5"
                        >
                          {product.imageUrl ? (
                            // Plain <img>, as everywhere else in this project:
                            // uploads are served as immutable static bytes and
                            // next/image is deliberately not used.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="size-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
                            />
                          ) : (
                            <span className="grid size-16 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-ink-100 text-ink-400">
                              <ImageIcon className="size-5" />
                            </span>
                          )}

                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-sm font-bold text-ink-900">
                              {product.name}
                            </span>
                            {product.shortDescription && (
                              <span className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-ink-500">
                                {product.shortDescription}
                              </span>
                            )}
                            <span className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                              {showPrices ? (
                                <span className="text-xs font-bold text-ink-700 tabular-nums">
                                  {formatMoney(product.price, locale)}
                                </span>
                              ) : (
                                <span />
                              )}
                              <ProductAdder
                                product={product}
                                quantity={qty}
                                onAdd={() => addProduct(product)}
                                onRemove={() => removeOne(product)}
                                t={t}
                                locale={locale}
                              />
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
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

            {lines.length === 0 ? (
              <p className="py-4 text-center text-xs font-semibold text-ink-400">
                {t.manualOrder.emptyBasket}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lines.map((line) => (
                  <li key={line.lineId} className="flex items-start gap-2 text-xs">
                    {/* The label already carries the chosen options, so a line
                        with choices reads as one thing rather than as a dish
                        with a footnote. */}
                    <span className="min-w-0 flex-1 font-semibold">{line.label}</span>
                    <span className="shrink-0 text-ink-400 tabular-nums">
                      ×{formatNumber(line.quantity, locale)}
                    </span>
                    {showPrices && (
                      <span className="shrink-0 font-bold tabular-nums">
                        {formatMoney(line.unitPrice * line.quantity, locale)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        bumpLine(byId.get(line.productId)!, line.choiceIds, -1)
                      }
                      aria-label={`${t.common.delete} ${line.label}`}
                      className="tap-safe grid size-5 shrink-0 place-items-center rounded text-ink-300 hover:text-red-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showPrices && (
              <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="text-xs font-semibold text-ink-500">
                  {t.manualOrder.total}
                </span>
                <span className="text-sm font-black tabular-nums">
                  {formatMoney(estimate, locale)}
                </span>
              </div>
            )}

            <Button
              type="submit"
              disabled={busy || lines.length === 0}
              className="w-full"
            >
              {t.manualOrder.place}
            </Button>
          </CardBody>
        </Card>
      </div>

      {/*
        The option picker. Deliberately the same questions in the same order a
        guest is asked on the public menu, because the person using this is
        reading them down a telephone to someone who may be looking at that
        menu.
      */}
      <Modal
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking?.name}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPicking(null)}>
              {t.common.cancel}
            </Button>
            <Button type="button" onClick={confirmOptions}>
              {t.manualOrder.addToOrder}
            </Button>
          </div>
        }
      >
        {picking && (
          <div className="space-y-4">
            {picking.optionGroups.map((group) => {
              const chosen = selection[group.id] ?? [];
              const multiple = group.maxSelect > 1;

              return (
                <fieldset key={group.id}>
                  <legend className="mb-1.5 flex items-baseline gap-2 text-sm font-bold text-ink-900">
                    {group.name}
                    <span className="text-[11px] font-semibold text-ink-500">
                      {group.isRequired
                        ? t.manualOrder.required
                        : multiple
                          ? `${t.manualOrder.upTo} ${formatNumber(group.maxSelect, locale)}`
                          : t.manualOrder.optional}
                    </span>
                  </legend>

                  <div className="space-y-1.5">
                    {group.choices.map((choice) => {
                      const checked = chosen.includes(choice.id);
                      // Unavailable, or the group is full and this is not one
                      // of the answers already given.
                      const blocked =
                        !choice.isAvailable ||
                        (!checked && multiple && chosen.length >= group.maxSelect);

                      return (
                        <label
                          key={choice.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border p-2.5 transition-colors",
                            checked
                              ? "border-brand-300 bg-brand-50"
                              : "border-ink-200 bg-surface",
                            blocked && "cursor-not-allowed opacity-45",
                          )}
                        >
                          <input
                            type={multiple ? "checkbox" : "radio"}
                            name={group.id}
                            checked={checked}
                            disabled={blocked}
                            onChange={() =>
                              setSelection((current) =>
                                toggleChoice(current, group, choice.id),
                              )
                            }
                            className="size-4 shrink-0 accent-brand-600"
                          />
                          <span className="min-w-0 flex-1 text-sm font-semibold text-ink-800">
                            {choice.name}
                          </span>
                          {showPrices && choice.priceDelta !== 0 && (
                            <span className="shrink-0 text-xs font-bold text-ink-500 tabular-nums">
                              {choice.priceDelta > 0 ? "+" : ""}
                              {formatMoney(choice.priceDelta, locale)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </Modal>
    </form>
  );
}

/** One half of the list/menu switch. */
function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-bold transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Add/remove for one dish, in either mode.
 *
 * A dish with options gets a single "choose" button rather than a stepper: the
 * second one added may not be the same as the first, so incrementing a number
 * would be answering a question nobody asked. The count beside it is the total
 * across every variant on the pad.
 */
function ProductAdder({
  product,
  quantity,
  onAdd,
  onRemove,
  t,
  locale,
}: {
  product: ProductRow;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  t: ReturnType<typeof useI18n>["t"];
  locale: Parameters<typeof formatNumber>[1];
}) {
  const hasOptions = product.optionGroups.length > 0;

  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onRemove}
        disabled={quantity === 0}
        aria-label={`−1 ${product.name}`}
        className="tap-safe grid size-11 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>

      <span
        className={cn(
          "w-8 text-center text-sm font-black tabular-nums",
          // ink-300 is a *border* step, not a text one: it reads at 1.5:1 on
          // paper and 2.1:1 on a dark card. ink-400 still says "nothing chosen
          // yet" without making the zero unreadable.
          quantity === 0 && "text-ink-400",
        )}
      >
        {formatNumber(quantity, locale)}
      </span>

      <button
        type="button"
        onClick={onAdd}
        aria-label={
          hasOptions
            ? `${t.manualOrder.chooseOptions} ${product.name}`
            : `+1 ${product.name}`
        }
        className="tap-safe grid size-11 place-items-center rounded-full text-ink-600 transition-colors hover:bg-ink-100"
      >
        <Plus className="size-4" />
      </button>
    </span>
  );
}
