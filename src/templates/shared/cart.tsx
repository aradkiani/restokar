"use client";

import * as React from "react";
import type { MenuOptionChoice, MenuProduct } from "../types";

/** A chosen option, kept on the line so the cart can show and re-price it. */
export interface CartLineOption {
  choiceId: string;
  groupName: string;
  name: string;
  priceDelta: number;
}

export interface CartLine {
  /**
   * Identity of a line, which is no longer the product id.
   *
   * A burger with chicken and a burger with beef are the same product at
   * different prices, and a guest may legitimately order both. Keying on the
   * product alone silently merged them into one line at one price.
   */
  lineId: string;
  productId: string;
  name: string;
  /** Unit price including the chosen options. */
  price: number;
  imageUrl: string | null;
  quantity: number;
  note: string;
  options: CartLineOption[];
  /**
   * The dish whose suggestion put this line here, if it came from one.
   *
   * Rides along on the ordinary cart line rather than justifying a separate
   * kind of item: a suggested dish is an ordinary dish, priced, re-priced and
   * ordered by exactly the same code. This is the only thing that distinguishes
   * it, it exists purely so the owner can later see whether the suggestion
   * earned anything, and the server verifies it before believing it.
   *
   * Survives a reload with the rest of the cart, so a guest who adds chips from
   * a suggestion and checks out an hour later is still counted.
   */
  recommendedFrom: string | null;
  /**
   * The guest reached this dish through a featured surface.
   *
   * Independent of `recommendedFrom`: a dish can be both promoted and suggested,
   * and the two answer different questions for the owner. Verified server-side
   * before it counts, and it never affects the price.
   */
  fromFeatured: boolean;
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (
    product: MenuProduct,
    quantity?: number,
    note?: string,
    choices?: MenuOptionChoice[],
    /** Set only when the guest reached this dish through a suggestion. */
    recommendedFrom?: string | null,
    /** Set only when they reached it through a featured surface. */
    fromFeatured?: boolean,
  ) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  setNote: (lineId: string, note: string) => void;
  remove: (lineId: string) => void;
  clear: () => void;
  /** Total across every variant of a product — drives the "in cart" badge. */
  quantityOf: (productId: string) => number;
  /**
   * Dishes already offered as a suggestion during this visit.
   *
   * Two surfaces suggest: the sheet that appears the moment something is added,
   * and the strip above the checkout button. Without a shared memory they
   * would independently arrive at the same answer — the engine is
   * deterministic — and a guest who declined the fries once would be offered
   * them again on the way to paying. Lives on the cart because that is the one
   * thing both surfaces already share.
   *
   * Deliberately not persisted. A guest returning tomorrow to a saved cart
   * should be offered the fries again; the point is not to nag twice in one
   * sitting.
   */
  suggestedProductIds: readonly string[];
  markSuggested: (productIds: readonly string[]) => void;
  /** Cart drawer visibility lives here so any template can open it. */
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = React.createContext<CartState | null>(null);

export function useCart(): CartState {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

const storageKey = (slug: string) => `restokar:cart:${slug}`;

/**
 * Two orders of the same dish with the same choices are one line; with
 * different choices they are two. Sorting the ids keeps the key stable no
 * matter which order the guest ticked the boxes in.
 */
export function cartLineId(productId: string, choiceIds: string[]): string {
  return choiceIds.length === 0
    ? productId
    : `${productId}|${[...choiceIds].sort().join(",")}`;
}

/**
 * Carts survive a page reload — guests routinely lock their phone mid-order —
 * but are scoped per restaurant so two tabs on two menus never collide.
 * `preview` disables persistence entirely so the dashboard previewer cannot
 * write into a real guest's cart.
 */
export function CartProvider({
  slug,
  preview = false,
  children,
}: {
  slug: string;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (preview) {
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey(slug));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed))
          setLines(parsed.map(reviveCartLine).filter(Boolean) as CartLine[]);
      }
    } catch {
      // Corrupt or unavailable storage must not stop the menu rendering.
    }
    setHydrated(true);
  }, [slug, preview]);

  React.useEffect(() => {
    if (!hydrated || preview) return;
    try {
      window.localStorage.setItem(storageKey(slug), JSON.stringify(lines));
    } catch {
      // Quota or private-mode failures are non-fatal.
    }
  }, [lines, slug, hydrated, preview]);

  const add = React.useCallback(
    (
      product: MenuProduct,
      quantity = 1,
      note = "",
      choices: MenuOptionChoice[] = [],
      recommendedFrom: string | null = null,
      fromFeatured = false,
    ) => {
      const options: CartLineOption[] = choices.map((choice) => ({
        choiceId: choice.id,
        groupName:
          product.optionGroups.find((g) => g.choices.some((c) => c.id === choice.id))
            ?.name ?? "",
        name: choice.name,
        priceDelta: choice.priceDelta,
      }));

      // Mirrors the server's arithmetic so the cart shows the total the guest
      // will actually be charged. The server still recomputes it from its own
      // prices — this is a display, not an authority.
      const unitPrice = Math.max(
        0,
        product.price + options.reduce((sum, o) => sum + o.priceDelta, 0),
      );
      const lineId = cartLineId(
        product.id,
        options.map((o) => o.choiceId),
      );

      setLines((prev) => {
        const existing = prev.find((l) => l.lineId === lineId);
        if (existing) {
          return prev.map((l) =>
            l.lineId === lineId
              ? {
                  ...l,
                  quantity: l.quantity + quantity,
                  note: note || l.note,
                  // First attribution wins. A guest who already had chips in
                  // the basket and then adds more from a suggestion did not
                  // discover them through it, and overwriting would credit the
                  // suggestion for a sale it did not make.
                  recommendedFrom: l.recommendedFrom ?? recommendedFrom,
                  // Same first-attribution-wins rule: a guest who already had
                  // the dish did not discover it through the strip.
                  fromFeatured: l.fromFeatured || fromFeatured,
                }
              : l,
          );
        }
        return [
          ...prev,
          {
            lineId,
            productId: product.id,
            name: product.name,
            price: unitPrice,
            imageUrl: product.imageUrl,
            quantity,
            note,
            options,
            recommendedFrom,
            fromFeatured,
          },
        ];
      });
    },
    [],
  );

  const setQuantity = React.useCallback((lineId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
    );
  }, []);

  const setNote = React.useCallback((lineId: string, note: string) => {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, note } : l)));
  }, []);

  const remove = React.useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const clear = React.useCallback(() => setLines([]), []);

  const [suggestedProductIds, setSuggested] = React.useState<string[]>([]);
  const markSuggested = React.useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    setSuggested((prev) => {
      const next = prev.concat(ids.filter((id) => !prev.includes(id)));
      // Same array when nothing was new, so subscribers do not re-render and
      // the effect that calls this cannot loop.
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const value = React.useMemo<CartState>(() => {
    const count = lines.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    return {
      lines,
      count,
      subtotal,
      add,
      setQuantity,
      setNote,
      remove,
      clear,
      quantityOf: (id) =>
        lines.reduce((sum, l) => (l.productId === id ? sum + l.quantity : sum), 0),
      suggestedProductIds,
      markSuggested,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    };
  }, [
    lines,
    add,
    setQuantity,
    setNote,
    remove,
    clear,
    isOpen,
    suggestedProductIds,
    markSuggested,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Accepts a stored line and brings it up to the current shape.
 *
 * Carts written before options existed have no `lineId` and no `options`, and a
 * guest who left a full cart on their phone yesterday should not find it empty
 * today. Deriving the missing fields is cheaper than versioning the payload.
 */
function reviveCartLine(value: unknown): CartLine | null {
  const l = value as Partial<CartLine> | null;
  if (
    !l ||
    typeof l.productId !== "string" ||
    typeof l.name !== "string" ||
    typeof l.price !== "number" ||
    typeof l.quantity !== "number" ||
    l.quantity <= 0
  ) {
    return null;
  }

  const options = Array.isArray(l.options)
    ? l.options.filter(
        (o): o is CartLineOption =>
          !!o && typeof o.choiceId === "string" && typeof o.priceDelta === "number",
      )
    : [];

  return {
    lineId:
      typeof l.lineId === "string"
        ? l.lineId
        : cartLineId(
            l.productId,
            options.map((o) => o.choiceId),
          ),
    productId: l.productId,
    name: l.name,
    price: l.price,
    imageUrl: typeof l.imageUrl === "string" ? l.imageUrl : null,
    quantity: l.quantity,
    note: typeof l.note === "string" ? l.note : "",
    options,
    // Absent on carts written before suggestions existed, which simply means
    // the line was not attributed to one.
    recommendedFrom: typeof l.recommendedFrom === "string" ? l.recommendedFrom : null,
    fromFeatured: l.fromFeatured === true,
  };
}
