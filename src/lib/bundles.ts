/**
 * Meal deals — «برگر + سیب‌زمینی + نوشابه» — and what makes one honest.
 *
 * The representation is the whole design decision, and it is deliberately the
 * smallest one available: **a bundle is an ordinary Product.** It has a price
 * the owner sets, an image, a category, option groups, a schedule and an
 * availability switch, because it is a row in the same table as every other
 * dish. What makes it a bundle is a list of the products it contains, and that
 * list is *descriptive* — it tells the guest what they are getting and lets the
 * menu compute the saving.
 *
 * What that buys, by not being a second kind of thing:
 *
 *   * `createOrder` needs no changes. A bundle is one order line.
 *   * The kitchen board, refunds, finance, analytics and the backup all keep
 *     working without knowing bundles exist.
 *   * Pricing is untouched — `pricing.ts` already prices a product with
 *     options, and a bundle is a product with options.
 *   * A venue that wants the combo to have its own photo and description
 *     already can, because it already has those fields.
 *
 * The alternative — a Bundle entity with its own path through cart, order
 * creation, kitchen display and refunds — is the enterprise-POS shape this
 * product does not need and cannot afford to maintain.
 *
 * Free of database and framework imports like every other domain module here.
 */

/**
 * How many products one bundle may list.
 *
 * Six covers every combination a restaurant actually sells — a main, a side, a
 * drink, a dessert and two spare slots. A list longer than this does not fit a
 * product card at 320px, and a venue reaching for a seventh is describing a
 * banquet menu rather than a meal deal.
 */
export const MAX_BUNDLE_COMPONENTS = 6;

/** One product inside a bundle, and how many of it. */
export interface BundleComponent {
  productId: string;
  quantity: number;
}

/**
 * Components with duplicates folded together and order preserved.
 *
 * An owner can legitimately add the same dish twice — "two burgers and a jug" —
 * and the editor lets them, so two rows for one product is data rather than a
 * mistake. Folding them means the guest reads "۲ × برگر" instead of the same
 * line printed twice, and the saving arithmetic counts it once at the right
 * quantity.
 *
 * First appearance sets the position, so the owner's ordering survives.
 * Non-positive quantities are dropped rather than clamped: a component the
 * bundle contains none of is not a component.
 */
export function normaliseComponents(
  components: readonly BundleComponent[],
): BundleComponent[] {
  const merged = new Map<string, number>();

  for (const component of components) {
    if (component.quantity <= 0) continue;
    merged.set(
      component.productId,
      (merged.get(component.productId) ?? 0) + component.quantity,
    );
  }

  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * What the components would cost bought separately, in whole Toman.
 *
 * `priceOf` returns null for a product that is no longer on the menu, and a
 * bundle containing one cannot be totalled honestly — so the whole total is
 * null rather than a smaller number that looks like a real price. The caller
 * then shows the bundle without a saving instead of understating it.
 *
 * Integer arithmetic throughout, like every other money path in this codebase.
 */
export function componentsTotal(
  components: readonly BundleComponent[],
  priceOf: (productId: string) => number | null,
): number | null {
  let total = 0;

  for (const component of normaliseComponents(components)) {
    const price = priceOf(component.productId);
    if (price === null) return null;
    total += price * component.quantity;
  }

  return total;
}

/**
 * What the guest saves, or null when there is nothing to claim.
 *
 * Null rather than zero for the two cases that are not savings: a bundle priced
 * at or above its parts, and a total that could not be computed. Both would
 * otherwise print «۰ تومان صرفه‌جویی», which is worse than printing nothing —
 * it draws attention to the absence of a deal.
 *
 * A bundle priced *above* its parts is not an error to refuse. A venue may
 * legitimately combine dishes that are cheaper à la carte and sell the
 * convenience; it simply gets no saving badge.
 */
export function bundleSaving(
  bundlePrice: number,
  components: readonly BundleComponent[],
  priceOf: (productId: string) => number | null,
): number | null {
  const total = componentsTotal(components, priceOf);
  if (total === null) return null;

  const saving = total - bundlePrice;
  return saving > 0 ? saving : null;
}

/**
 * Whether a bundle can actually be assembled right now.
 *
 * The rule that keeps this feature from damaging a venue: **a combo whose
 * chips are sold out is not a combo.** Offering one is the same category of
 * mistake as promoting a dish outside its serving hours, which `featured.ts`
 * already refuses to do.
 *
 * Availability is not re-derived here. `orderableProductIds` is the effective
 * answer the caller already obtained from `resolveAvailability` — the single
 * source of truth for whether a dish can be sold — and this function composes
 * those answers exactly as `isFeaturedNow` composes one of them. Adding a
 * second opinion about availability is the one thing this module must not do.
 *
 * A bundle listing no components is orderable on its own merits. That is a
 * product the owner has not finished describing, not a broken bundle, and
 * refusing to sell it would be a surprising way to report an empty list.
 */
export function isBundleOrderable(
  bundleIsAvailable: boolean,
  components: readonly BundleComponent[],
  orderableProductIds: ReadonlySet<string>,
): boolean {
  if (!bundleIsAvailable) return false;

  return normaliseComponents(components).every((component) =>
    orderableProductIds.has(component.productId),
  );
}

/** A bundle as a surface needs it: what is in it, and what it saves. */
export interface ResolvedBundle {
  components: BundleComponent[];
  /** Whole Toman, or null when there is no saving worth printing. */
  saving: number | null;
  isOrderable: boolean;
}

/**
 * Everything a template needs about one bundle, from one call.
 *
 * Bundled together — the pun is unavoidable — so that a template cannot render
 * the component list having forgotten to check whether the bundle can be
 * assembled, which is the one combination of these three answers that misleads
 * a guest.
 */
export function resolveBundle(input: {
  price: number;
  isAvailable: boolean;
  components: readonly BundleComponent[];
  priceOf: (productId: string) => number | null;
  orderableProductIds: ReadonlySet<string>;
}): ResolvedBundle {
  const components = normaliseComponents(input.components);

  return {
    components,
    saving: bundleSaving(input.price, components, input.priceOf),
    isOrderable: isBundleOrderable(
      input.isAvailable,
      components,
      input.orderableProductIds,
    ),
  };
}

/** Whether a product is a bundle at all. */
export function isBundle(components: readonly BundleComponent[]): boolean {
  return normaliseComponents(components).length > 0;
}
