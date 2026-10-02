"use client";

import * as React from "react";
import { Clock, Plus, X } from "lucide-react";
import type { MenuOptionChoice, MenuProduct } from "../types";
import { useMenu } from "./runtime";
import { useCart } from "./cart";
import { PriceTag, ProductImage, QuantityStepper } from "./pieces";
import { PairingSuggestions } from "./pairings";
import { BundleOffers } from "./bundle-offer";
import { UpgradePrompt } from "./upgrade-prompt";
import { CategoryIcon } from "@/components/icon";
import {
  defaultSelection,
  missingRequiredGroups,
  toggleChoice as toggleChoiceIn,
} from "@/lib/order-options";

import { formatMoney, formatNumber } from "@/lib/format";

/**
 * Full product detail: hero image, long description, and the three
 * owner-defined information sections. Presented as a bottom sheet on mobile —
 * the overwhelming majority of menu traffic arrives from a QR scan on a phone.
 */
export function ProductSheet({
  product,
  onClose,
}: {
  product: MenuProduct | null;
  onClose: () => void;
}) {
  const { t, locale, data, preview, recommendedFrom, fromFeatured } = useMenu();
  const cart = useCart();
  const [quantity, setQuantity] = React.useState(1);
  const [selected, setSelected] = React.useState<Record<string, string[]>>({});
  const [showErrors, setShowErrors] = React.useState(false);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  // Reset the draft whenever a different product is opened.
  React.useEffect(() => {
    if (product) {
      setQuantity(Math.max(1, cart.quantityOf(product.id) || 1));
      setSelected(defaultSelection(product.optionGroups));
      setShowErrors(false);
    }
    // Reading cart here would re-run the effect on every cart change and stomp
    // the user's in-progress edits, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (product && !dialog.open) dialog.showModal();
    if (!product && dialog.open) dialog.close();
  }, [product]);

  React.useEffect(() => {
    if (!product) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [product]);

  const canOrder = data.restaurant.onlineOrderingEnabled && !preview;

  /**
   * A venue that has turned photos off gets none here — including the generated
   * placeholder ProductImage would otherwise substitute. That placeholder is
   * the right call when a photo is merely missing, and the wrong one when the
   * venue has decided its menu is text.
   */
  const showPhoto = data.restaurant.showProductPhotos;

  const chosen = React.useMemo(
    () => (product ? chosenChoices(product, selected) : []),
    [product, selected],
  );

  /** Groups the guest still has to answer. */
  const missing = React.useMemo(
    () => missingRequiredGroups(product?.optionGroups ?? [], selected),
    [product, selected],
  );

  // Shown live so the price on the button matches the price on the card once a
  // more expensive option is picked, rather than surprising the guest at
  // checkout.
  const unitPrice = product
    ? Math.max(0, product.price + chosen.reduce((sum, c) => sum + c.priceDelta, 0))
    : 0;

  /**
   * Delegated to `order-options.ts`, which is the platform's one answer to
   * "what does tapping a choice do".
   *
   * This sheet used to carry its own copy of that rule, alongside its own
   * `defaultSelection` and its own required-group check. Three copies of logic
   * the dashboard already shared, and the upgrade offer made the duplication
   * load-bearing: `resolveUpgrade` measures an upgrade's cost from whatever
   * `defaultSelection` ticks, so a sheet that started the guest somewhere else
   * would quote a price the server then disagreed with.
   */
  function toggleChoice(groupId: string, choiceId: string) {
    const group = product?.optionGroups.find((g) => g.id === groupId);
    if (!group) return;
    setSelected((prev) => toggleChoiceIn(prev, group, choiceId));
  }

  function handleAdd() {
    if (!product) return;
    if (missing.length > 0) {
      setShowErrors(true);
      return;
    }
    // No per-item note: the guest writes one note for the whole order in the
    // cart instead. A free-text box per dish invited requests the kitchen never
    // agreed to and nobody reads on a busy pass.
    // `recommendedFrom` is set only when this sheet was opened from a
    // suggestion, so a dish the guest found themselves is never credited to one.
    cart.add(product, quantity, "", chosen, recommendedFrom, fromFeatured);
    onClose();
    /*
      No upsell sheet on this path, deliberately.

      Adding from the sheet opens the cart drawer, and the drawer already
      carries its own suggestion strip. Raising the add-time sheet as well would
      stack two dialogs and ask the same question twice in the same second. The
      quick-add "+" on a card is the path that has no drawer behind it, and that
      is where `useAddToCart` raises the sheet.
    */
    cart.open();
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg"
    >
      {product && (
        <div
          className="flex max-h-[92dvh] animate-[slide-up_0.3s_cubic-bezier(0.22,1,0.36,1)] flex-col overflow-hidden rounded-t-[var(--m-radius-lg)] text-start sm:animate-[scale-in_0.2s_ease-out] sm:rounded-[var(--m-radius-lg)]"
          style={{
            background: "var(--m-surface)",
            color: "var(--m-text)",
            fontFamily: "var(--m-font)",
          }}
        >
          {showPhoto ? (
            <div className="relative shrink-0">
              <ProductImage
                src={product.imageUrl}
                alt={product.name}
                seed={product.id}
                rounded="0"
                className="h-52 w-full object-cover sm:h-60"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
              >
                <X className="size-5" />
              </button>
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/70 sm:hidden" />
            </div>
          ) : (
            /*
             * Without the image there is nothing for the close button to sit
             * on, so the sheet grows a real header instead of leaving the
             * control floating over the dish name. The grab handle is drawn in
             * the theme's border colour rather than the white used above it —
             * on the photo it sits over dark pixels, here it would be white on
             * a white surface and simply vanish.
             */
            <div className="relative flex shrink-0 items-center justify-end px-2 pt-2 pb-1">
              {/* Centred on the bar itself rather than absolutely over the
                  content, so the close button below keeps its own height and
                  cannot overlap the dish name. */}
              <div
                className="absolute inset-x-0 top-2 mx-auto h-1 w-10 rounded-full sm:hidden"
                style={{ background: "var(--m-border)" }}
                aria-hidden
              />
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="tap-safe grid size-9 place-items-center rounded-full transition-colors"
                style={{ color: "var(--m-text)" }}
              >
                <X className="size-5" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl leading-tight font-extrabold">{product.name}</h2>
                {product.nameEn && (
                  <p className="mt-0.5 text-sm opacity-50" dir="ltr">
                    {product.nameEn}
                  </p>
                )}
              </div>
              <PriceTag
                price={product.price}
                compareAt={product.compareAtPrice}
                show={data.restaurant.showPrices}
                locale={locale}
                className="shrink-0 text-lg"
              />
            </div>

            {product.prepMinutes ? (
              <p
                className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{
                  background: "var(--m-secondary-soft)",
                  color: "var(--m-secondary)",
                }}
              >
                <Clock className="size-3.5" />
                {formatNumber(product.prepMinutes, locale)} {t.publicMenu.minutes}
              </p>
            ) : null}

            {(product.fullDescription || product.shortDescription) && (
              <p className="mt-4 text-sm leading-8 opacity-80">
                {product.fullDescription || product.shortDescription}
              </p>
            )}

            {/*
              The size ladder as a one-tap offer, above the groups rather than
              inside them. It ticks a choice in the same selection the fieldsets
              below read, so the two always agree — there is no second state.
            */}
            {canOrder && product.isAvailable && (
              <UpgradePrompt
                product={product}
                selected={selected}
                onSelect={(groupId, choiceId) => toggleChoice(groupId, choiceId)}
              />
            )}

            {canOrder && product.isAvailable && product.optionGroups.length > 0 && (
              <div className="mt-6 space-y-5">
                {product.optionGroups.map((group) => {
                  const current = selected[group.id] ?? [];
                  const isMissing = showErrors && missing.some((g) => g.id === group.id);
                  const multiple = group.maxSelect > 1;

                  return (
                    <fieldset key={group.id}>
                      <legend className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">
                        {group.name}
                        {group.isRequired ? (
                          <span
                            className="text-xs font-semibold"
                            style={{ color: "var(--m-primary)" }}
                          >
                            {t.publicMenu.optionRequired}
                          </span>
                        ) : (
                          <span className="text-xs font-normal opacity-55">
                            {t.common.optional}
                          </span>
                        )}
                      </legend>

                      {multiple && (
                        <p className="mt-0.5 text-xs opacity-55">
                          {t.publicMenu.optionChooseUpTo}{" "}
                          <bdi>{formatNumber(group.maxSelect, locale)}</bdi>
                        </p>
                      )}

                      <div className="mt-2 space-y-1.5">
                        {group.choices.map((choice) => {
                          const checked = current.includes(choice.id);
                          const disabled =
                            !choice.isAvailable ||
                            (!checked && multiple && current.length >= group.maxSelect);

                          return (
                            <label
                              key={choice.id}
                              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--m-radius-sm)] px-3 py-2 transition-colors"
                              style={{
                                background: checked
                                  ? "var(--m-primary-soft)"
                                  : "transparent",
                                opacity: disabled ? 0.45 : 1,
                                cursor: disabled ? "not-allowed" : "pointer",
                                border: `1px solid ${
                                  checked ? "var(--m-primary)" : "var(--m-border)"
                                }`,
                              }}
                            >
                              <input
                                type={multiple ? "checkbox" : "radio"}
                                name={group.id}
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleChoice(group.id, choice.id)}
                                className="size-4 shrink-0 accent-[var(--m-primary)]"
                              />
                              <span className="min-w-0 flex-1 text-sm">
                                {choice.name}
                                {!choice.isAvailable && (
                                  <span className="ms-2 text-xs opacity-70">
                                    {t.publicMenu.unavailable}
                                  </span>
                                )}
                              </span>

                              {/* Only a difference is worth showing: "+۰" on
                                  every default option is noise. */}
                              {choice.priceDelta !== 0 && data.restaurant.showPrices && (
                                <span className="shrink-0 text-xs font-bold tabular-nums">
                                  <bdi>
                                    {choice.priceDelta > 0 ? "+" : "−"}
                                    {formatMoney(Math.abs(choice.priceDelta), locale)}
                                  </bdi>
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {isMissing && (
                        <p
                          role="alert"
                          className="mt-1.5 text-xs font-semibold"
                          style={{ color: "var(--m-primary)" }}
                        >
                          {t.publicMenu.optionPickOne}
                        </p>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            )}

            {product.infoSections.length > 0 && (
              <div className="mt-6 space-y-3">
                {product.infoSections.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-[var(--m-radius-sm)] p-4"
                    style={{ background: "var(--m-primary-soft)" }}
                  >
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                      <CategoryIcon
                        name={section.icon}
                        className="size-4 shrink-0"
                        style={{ color: "var(--m-primary)" }}
                      />
                      {section.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-7 opacity-80">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* After the owner's own information sections: a guest reads what
                this dish is before being told what goes with it. */}
            {/* Deals first, then pairings: "the same meal for less" is a
                stronger offer than "add something else", and putting the
                cheaper option second would read as an upsell ladder. */}
            <BundleOffers product={product} />
            <PairingSuggestions product={product} />
          </div>

          {canOrder && product.isAvailable && (
            <div
              className="flex shrink-0 items-center gap-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              style={{ borderColor: "var(--m-border)", background: "var(--m-surface)" }}
            >
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                min={1}
                locale={locale}
              />
              <button
                type="button"
                onClick={handleAdd}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm font-extrabold transition-transform active:scale-[0.98]"
                style={{
                  background: "var(--m-primary)",
                  color: "var(--m-primary-contrast)",
                }}
              >
                <Plus className="size-4" />
                {t.publicMenu.addToCart}
                {data.restaurant.showPrices && (
                  // Option-inclusive: the figure on this button is the one the
                  // guest is agreeing to, so it has to move when they pick the
                  // more expensive cut.
                  <span className="opacity-90">
                    · {formatMoney(unitPrice * quantity, locale)}
                  </span>
                )}
              </button>
            </div>
          )}

          {!product.isAvailable && (
            <div
              className="shrink-0 border-t p-4 text-center text-sm font-bold opacity-60"
              style={{ borderColor: "var(--m-border)" }}
            >
              {t.publicMenu.unavailable}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/**
 * Flattens the selection map back into choice *objects*, in menu order.
 *
 * Not a duplicate of `selectedChoiceIds`: this sheet needs the choices
 * themselves to price the line live, while the shared helper returns the ids
 * the server wants. Same ordering rule, two different projections of it.
 */
function chosenChoices(
  product: MenuProduct,
  selected: Record<string, string[]>,
): MenuOptionChoice[] {
  return product.optionGroups.flatMap((group) =>
    group.choices.filter((choice) => (selected[group.id] ?? []).includes(choice.id)),
  );
}
