"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useCart } from "./cart";
import { useMenu } from "./runtime";
import {
  SuggestionRow,
  useSuggestionAdd,
  useSuggestionImpressions,
} from "./suggestion-row";
import { useUpsells } from "./use-upsells";

/**
 * "Anything with that?" — asked the moment a dish goes into the basket.
 *
 * The suggestions themselves are not new; the timing is. They used to appear
 * only in the cart, which a guest opens when they have decided to stop
 * ordering. Offering chips with a burger is worth something at the moment the
 * burger is chosen and worth much less on the way to the till.
 *
 * Everything about *what* to suggest stays in `useUpsells` — the owner's own
 * pairings first, then meal deals, then what genuinely sells together, then
 * featured dishes. This component only decides *when* to ask and how to get
 * out of the way.
 *
 * ### Not shown twice
 *
 * Whatever appears here is recorded on the cart, and the strip above the
 * checkout button skips it. The engine is deterministic, so without that the
 * same two dishes would be offered again on the way to paying — which reads as
 * nagging rather than helping.
 */
export function UpsellSheet({
  productId,
  onClose,
}: {
  /** The dish just added, or null when nothing is being offered. */
  productId: string | null;
  onClose: () => void;
}) {
  const { t } = useMenu();
  const cart = useCart();
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const handleAdd = useSuggestionAdd();

  const sources = React.useMemo(() => (productId ? [productId] : []), [productId]);

  /*
    Three at most. This interrupts a guest mid-flow, so it has to be answerable
    at a glance — a full list would be a menu on top of a menu, and the cart
    strip already exists for browsing suggestions at leisure.

    `useUpsells` excludes what is already in the basket on its own, which is
    what stops the sheet offering the dish that just triggered it.

    Deliberately *not* excluding `cart.suggestedProductIds`. The exclusion runs
    one way only — this sheet chooses freely and records what it showed, and the
    checkout strip skips that. Reading the set here instead made the sheet eat
    itself: it resolved its picks, the effect below recorded them, that set fed
    straight back in as the exclusion, the picks recomputed to nothing and the
    sheet closed in the same breath. The dialog never reached the screen.
  */
  const picks = useUpsells(sources, 3);

  const open = productId !== null && picks.length > 0;

  useSuggestionImpressions(picks, open);

  /*
    Remember what was offered, so the checkout strip does not repeat it.

    In an effect rather than during render: this writes to shared state, and
    `markSuggested` returns the same array when nothing is new, so the write
    settles after one pass instead of looping.
  */
  const markSuggested = cart.markSuggested;
  React.useEffect(() => {
    if (!open) return;
    markSuggested(picks.map((pick) => pick.product.id));
  }, [open, picks, markSuggested]);

  // <dialog> is opened imperatively, matching the cart drawer beside it.
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /*
    A dish with nothing to suggest must not leave the caller waiting for a
    dismissal that never comes — the sheet simply never opens, so the trigger
    is cleared immediately and the next add can raise it again.
  */
  React.useEffect(() => {
    if (productId !== null && picks.length === 0) onClose();
  }, [productId, picks.length, onClose]);

  if (productId === null) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        // Escape closes it like any other dismissal rather than unmounting the
        // element out from under React.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-label={t.upsell.title}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/50 sm:m-auto sm:max-w-sm"
    >
      {open && (
        <div
          className="animate-[slide-up_0.25s_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-t-[var(--m-radius-lg)] text-start sm:animate-[scale-in_0.2s_ease-out] sm:rounded-[var(--m-radius-lg)]"
          style={{
            background: "var(--m-bg)",
            color: "var(--m-text)",
            fontFamily: "var(--m-font)",
          }}
        >
          <header className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{t.upsell.title}</p>
              <p className="mt-0.5 text-xs opacity-70">{t.upsell.subtitle}</p>
            </div>

            {/*
              A real close button, not just the backdrop. This appears
              unprompted while the guest is browsing, so getting rid of it has
              to be the most obvious thing on it.
            */}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="tap-safe -me-1 -mt-1 shrink-0 rounded-full p-1.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <ul className="space-y-1.5 px-2.5 pb-2">
            {picks.map((pick) => (
              <SuggestionRow
                key={pick.product.id}
                pick={pick}
                /*
                  One tap adds and closes. A guest who wants two suggestions can
                  add the first, and the next sheet will offer the rest — but
                  keeping this open after a tap turns an aside into a checkout
                  of its own.
                */
                onAdd={(chosen) => {
                  handleAdd(chosen);
                  onClose();
                }}
              />
            ))}
          </ul>

          <div className="px-4 pt-1 pb-4">
            <button
              type="button"
              onClick={onClose}
              className="tap-safe h-11 w-full rounded-full text-xs font-extrabold opacity-70 transition-opacity hover:opacity-100"
              style={{ background: "var(--m-surface)" }}
            >
              {t.upsell.dismiss}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
