"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Loader2,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useMenu } from "./runtime";
import { useCart } from "./cart";
import { PriceTag, ProductImage, QuantityStepper } from "./pieces";
import { RecommendationStrip } from "./recommendations";
import { formatMoney, localizeDigits, toEnglishDigits } from "@/lib/format";
import { calculatePrice } from "@/lib/pricing";

type Step = "cart" | "details";

/**
 * Cart + checkout in one sheet. Kept to two steps because a guest sitting at a
 * table with a phone in one hand will abandon anything longer.
 */
export function CartDrawer() {
  const { t, locale, data, preview, presetTable } = useMenu();
  const cart = useCart();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("cart");
  const [tableNumber, setTableNumber] = React.useState(presetTable ?? "");
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [note, setNote] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"CASH_ON_SITE" | "ONLINE">(
    "CASH_ON_SITE",
  );
  const [discountCode, setDiscountCode] = React.useState("");
  /**
   * What the server said the typed code is worth.
   *
   * Never computed here. The drawer knows the size of the basket and nothing
   * about what any code means, which is the point: the amount, the reason a
   * code was refused, and the spelling shown back to the guest all come from
   * `/api/public/discount-preview`. Cleared whenever the code or the basket
   * changes, so a stale saving can never sit next to a total it no longer
   * belongs to.
   */
  const [discount, setDiscount] = React.useState<{
    code: string;
    amount: number;
    /** What it was computed against, so a stale figure can be spotted. */
    subtotal: number;
    typed: string;
  } | null>(null);
  const [discountReason, setDiscountReason] = React.useState<string | null>(null);
  const [checkingDiscount, setCheckingDiscount] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  /** Guards double submission ahead of the re-render — see `submitOrder`. */
  const submitLock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tipPercent, setTipPercent] = React.useState(0);

  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const isRtl = locale === "fa";
  const Back = isRtl ? ArrowRight : ArrowLeft;

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (cart.isOpen && !dialog.open) dialog.showModal();
    if (!cart.isOpen && dialog.open) dialog.close();
    if (!cart.isOpen) {
      setStep("cart");
      setError(null);
    }
  }, [cart.isOpen]);

  React.useEffect(() => {
    if (!cart.isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [cart.isOpen]);

  // Remember the guest's name between visits; the table comes from the QR code.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("restokar:guest-name");
      if (saved) setCustomerName(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  React.useEffect(() => {
    if (presetTable) setTableNumber(presetTable);
  }, [presetTable]);

  const fmt = (n: number) => formatMoney(n, locale);

  /**
   * The same calculation the server runs at checkout, fed the same settings —
   * so the figure in the drawer is the figure charged. The tip is derived from
   * the basket before tax, which is what the percentages are understood to mean.
   */
  const tipAmount = data.restaurant.tipEnabled
    ? Math.round((cart.subtotal * tipPercent) / 100)
    : 0;

  /**
   * The saving, but only while it still describes what is on screen.
   *
   * A preview is a statement about one code and one basket. Derived rather than
   * cleared from an effect so there is no moment — however brief — where a
   * saving from the previous basket is rendered beside the new total; the
   * comparison simply stops matching and the line is gone on the same render.
   */
  const appliedDiscount =
    discount && discount.subtotal === cart.subtotal && discount.typed === discountCode
      ? discount
      : null;

  const price = React.useMemo(
    () =>
      calculatePrice(cart.subtotal, data.restaurant, {
        tip: tipAmount,
        // The server's figure, fed through the same shared calculation the
        // drawer already ran for tax, service and rounding. Nothing about what
        // the code is worth is decided here.
        discount: appliedDiscount?.amount ?? 0,
      }),
    [cart.subtotal, data.restaurant, tipAmount, appliedDiscount],
  );

  /** Asks the server what the typed code is worth on this basket. */
  async function checkDiscount() {
    if (checkingDiscount) return;
    setCheckingDiscount(true);
    setDiscountReason(null);

    try {
      const response = await fetch("/api/public/discount-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: data.restaurant.slug,
          code: discountCode,
          subtotal: cart.subtotal,
          tip: tipAmount,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setDiscountReason(payload?.error?.message ?? t.publicMenu.discountCheckFailed);
        return;
      }

      if (!payload.data.valid) {
        // Keyed by the server's reason; an unrecognised one falls back rather
        // than rendering "undefined" at a guest.
        const reasons = t.publicMenu.discountRejected as Record<string, string>;
        setDiscountReason(
          reasons[payload.data.reason] ?? t.publicMenu.discountCheckFailed,
        );
        return;
      }

      setDiscount({
        code: payload.data.code,
        amount: payload.data.discount,
        subtotal: cart.subtotal,
        typed: discountCode,
      });
    } catch {
      setDiscountReason(t.publicMenu.discountCheckFailed);
    } finally {
      setCheckingDiscount(false);
    }
  }

  async function submitOrder() {
    /*
      A synchronous lock, because `disabled={submitting}` is not one.

      Setting state does not disable the button until React re-renders, and a
      double-tap on a phone lands well inside that window — two POSTs, two
      orders, one guest. The ref flips before the first `await`, so the second
      tap returns immediately however fast it arrives. The state flag stays
      because it is what draws the spinner.
    */
    if (submitLock.current) return;

    setError(null);

    const name = customerName.trim();
    const table = toEnglishDigits(tableNumber.trim());
    if (!name || !table) {
      setError(t.publicMenu.requiredFields);
      return;
    }

    /*
      The footer is already gated on a non-empty basket, so this only catches
      the odd case: a second tab clearing the cart through the shared storage
      key while this one sits on the details step. Cheaper than letting the
      server answer with a validation error the guest cannot act on.
    */
    if (cart.lines.length === 0) {
      setError(t.publicMenu.emptyCart);
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: data.restaurant.slug,
          tableNumber: table,
          customerName: name,
          /*
            Sent only when the venue asks for it.

            Belt and braces: the server drops a number that arrives while the
            toggle is off, so this is not the guard — it just means a guest who
            typed a number before the owner switched collection off does not
            have it travel over the wire for nothing.
          */
          customerPhone: data.restaurant.phoneCollectionEnabled
            ? toEnglishDigits(customerPhone.trim()) || undefined
            : undefined,
          note: note.trim() || undefined,
          paymentMethod,
          // The server recomputes everything from its own prices; this is only
          // the guest's chosen tip, and it is re-checked and capped there.
          tip: tipAmount,
          // The code only, never the amount it is worth. The server looks that
          // up, the same way it does for product prices and option deltas.
          discountCode: discountCode.trim() || undefined,
          items: cart.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            note: line.note || undefined,
            // Ids only. The server looks up what each choice costs; nothing
            // here tells it a price.
            choiceIds: line.options.length
              ? line.options.map((o) => o.choiceId)
              : undefined,
            // Why this line is here, for the owner's upsell figures. A claim
            // only: the server checks it against the venue's own suggestions
            // and ignores it if no such suggestion exists, and it can never
            // affect what is charged.
            recommendedFrom: line.recommendedFrom ?? undefined,
            // Likewise a claim: the server confirms the dish really was being
            // promoted before crediting the sale to merchandising.
            fromFeatured: line.fromFeatured || undefined,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload?.error?.message ?? t.common.error);
        submitLock.current = false;
        setSubmitting(false);
        return;
      }

      try {
        window.localStorage.setItem("restokar:guest-name", name);
      } catch {
        /* non-fatal */
      }

      cart.clear();
      cart.close();

      // Online orders hand off to the gateway; on-site orders go straight to
      // the live status page.
      /*
        Deliberately still locked.

        Navigation is asynchronous: releasing the lock here leaves a live button
        on screen for as long as the gateway takes to answer, and a guest who
        taps it again during that gap places a second order they will be charged
        for. The lock is released only on a path that stays on this page — the
        component unmounts on success.
      */
      if (payload.data.paymentUrl) {
        window.location.href = payload.data.paymentUrl;
      } else {
        router.push(`/menu/${data.restaurant.slug}/order/${payload.data.publicToken}`);
      }
      return;
    } catch {
      setError(t.common.error);
    }

    // Only reached when the order was *not* placed, so the guest can correct
    // whatever was wrong and try again.
    submitLock.current = false;
    setSubmitting(false);
  }

  const allowOnlinePayment =
    data.restaurant.onlinePaymentEnabled && data.restaurant.onlineOrderingEnabled;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        cart.close();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) cart.close();
      }}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md"
    >
      {cart.isOpen && (
        <div
          className="flex max-h-[92dvh] animate-[slide-up_0.3s_cubic-bezier(0.22,1,0.36,1)] flex-col overflow-hidden rounded-t-[var(--m-radius-lg)] text-start sm:animate-[scale-in_0.2s_ease-out] sm:rounded-[var(--m-radius-lg)]"
          style={{
            background: "var(--m-surface)",
            color: "var(--m-text)",
            fontFamily: "var(--m-font)",
          }}
        >
          <header
            className="flex shrink-0 items-center gap-3 border-b p-4"
            style={{ borderColor: "var(--m-border)" }}
          >
            {step === "details" && (
              <button
                type="button"
                onClick={() => setStep("cart")}
                aria-label={t.common.back}
                className="grid size-9 place-items-center rounded-full transition-colors hover:bg-black/5"
              >
                <Back className="size-5" />
              </button>
            )}
            <h2 className="flex-1 text-base font-extrabold">
              {step === "cart" ? t.publicMenu.cart : t.publicMenu.checkout}
            </h2>
            <button
              type="button"
              onClick={cart.close}
              aria-label={t.common.close}
              className="grid size-9 place-items-center rounded-full transition-colors hover:bg-black/5"
            >
              <X className="size-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div
                  className="mb-4 grid size-16 place-items-center rounded-full"
                  style={{ background: "var(--m-primary-soft)" }}
                >
                  <ShoppingBag className="size-7" style={{ color: "var(--m-primary)" }} />
                </div>
                <p className="font-bold">{t.publicMenu.cartEmpty}</p>
                <p className="mt-1 text-sm opacity-60">{t.publicMenu.cartEmptyHint}</p>
              </div>
            ) : step === "cart" ? (
              <ul className="divide-y" style={{ borderColor: "var(--m-border)" }}>
                {cart.lines.map((line) => (
                  <li key={line.lineId} className="flex gap-3 p-4">
                    <ProductImage
                      src={line.imageUrl}
                      alt={line.name}
                      seed={line.productId}
                      className="size-16 shrink-0"
                      rounded="var(--m-radius-sm)"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-bold">{line.name}</p>
                        <button
                          type="button"
                          onClick={() => cart.remove(line.lineId)}
                          aria-label={t.common.delete}
                          className="shrink-0 rounded-full p-1 opacity-40 transition-opacity hover:opacity-100"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      {line.options.length > 0 && (
                        // Two identical dishes differing only by their options
                        // are separate lines, so the choices are what tells
                        // them apart. Without this the cart shows the same name
                        // twice at two prices.
                        <p className="mt-0.5 text-xs opacity-70">
                          {line.options.map((o) => o.name).join("، ")}
                        </p>
                      )}
                      {line.note && (
                        <p className="mt-0.5 line-clamp-2 text-xs opacity-60">
                          {line.note}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QuantityStepper
                          size="sm"
                          value={line.quantity}
                          min={0}
                          ariaLabel={line.name}
                          locale={locale}
                          onChange={(q) => cart.setQuantity(line.lineId, q)}
                        />
                        <PriceTag
                          price={line.price * line.quantity}
                          show={data.restaurant.showPrices}
                          locale={locale}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">
                      {t.publicMenu.tableNumber}
                    </span>
                    <input
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value.slice(0, 20))}
                      placeholder={t.publicMenu.tableNumberPlaceholder}
                      inputMode="numeric"
                      required
                      className="h-11 w-full rounded-[var(--m-radius-sm)] border px-3 text-sm outline-none"
                      style={{
                        background: "var(--m-bg)",
                        borderColor: "var(--m-border)",
                        color: "var(--m-text)",
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">
                      {t.publicMenu.yourName}
                    </span>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value.slice(0, 60))}
                      placeholder={t.publicMenu.yourNamePlaceholder}
                      required
                      className="h-11 w-full rounded-[var(--m-radius-sm)] border px-3 text-sm outline-none"
                      style={{
                        background: "var(--m-bg)",
                        borderColor: "var(--m-border)",
                        color: "var(--m-text)",
                      }}
                    />
                  </label>
                </div>

                {/*
                  Only when the venue has asked for it, and optional even then.

                  A guest who would rather not give a number must still be able
                  to order dinner, so this is never `required`. The label says
                  «اختیاری» rather than leaving that to be discovered, and the
                  server drops anything sent while the venue has the toggle off.
                */}
                {data.restaurant.phoneCollectionEnabled && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">
                      {t.publicMenu.yourPhone}
                    </span>
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.slice(0, 20))}
                      placeholder={t.publicMenu.yourPhonePlaceholder}
                      // `tel` brings up the numeric keypad; `dir="ltr"` keeps a
                      // phone number reading left to right on an RTL menu, the
                      // rule every number in this product follows.
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      autoComplete="tel"
                      className="h-11 w-full rounded-[var(--m-radius-sm)] border px-3 text-sm outline-none"
                      style={{
                        background: "var(--m-bg)",
                        borderColor: "var(--m-border)",
                        color: "var(--m-text)",
                      }}
                    />
                    <span className="mt-1 block text-xs opacity-70">
                      {t.publicMenu.yourPhoneHint}
                    </span>
                  </label>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold">
                    {t.publicMenu.orderNote}
                    <span className="ms-1.5 text-xs font-normal opacity-60">
                      ({t.common.optional})
                    </span>
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder={t.publicMenu.orderNotePlaceholder}
                    className="w-full resize-none rounded-[var(--m-radius-sm)] border px-3 py-2.5 text-sm outline-none"
                    style={{
                      background: "var(--m-bg)",
                      borderColor: "var(--m-border)",
                      color: "var(--m-text)",
                    }}
                  />
                </label>

                {allowOnlinePayment && (
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">
                      {t.publicMenu.paymentMethod}
                    </legend>
                    <div className="grid gap-2">
                      <PaymentOption
                        checked={paymentMethod === "CASH_ON_SITE"}
                        onSelect={() => setPaymentMethod("CASH_ON_SITE")}
                        icon={<Wallet className="size-5" />}
                        title={t.publicMenu.payOnSite}
                        hint={t.publicMenu.payOnSiteHint}
                      />
                      <PaymentOption
                        checked={paymentMethod === "ONLINE"}
                        onSelect={() => setPaymentMethod("ONLINE")}
                        icon={<CreditCard className="size-5" />}
                        title={t.publicMenu.payOnline}
                        hint={t.publicMenu.payOnlineHint}
                      />
                    </div>
                  </fieldset>
                )}

                {error && (
                  <p
                    role="alert"
                    className="rounded-[var(--m-radius-sm)] bg-red-500/10 p-3 text-sm font-semibold text-red-600"
                  >
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          {/*
            Between the basket and the totals, and only on the cart step.

            A guest reviewing what they have is deciding whether they are
            finished, which is the moment an extra suggestion is worth making.
            Once they have moved on to entering their name and table it is an
            interruption, so it does not follow them there.
          */}
          {step === "cart" && cart.lines.length > 0 && <RecommendationStrip />}

          {cart.lines.length > 0 && (
            <footer
              className="shrink-0 space-y-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              style={{ borderColor: "var(--m-border)" }}
            >
              {data.restaurant.showPrices && (
                <div className="space-y-1.5 text-sm">
                  {/* Only shown once there is something to explain — a venue
                      with no tax or service charge keeps the original single
                      total line rather than gaining an itemised receipt. */}
                  {(price.serviceCharge > 0 ||
                    price.tax > 0 ||
                    price.roundingAdjustment !== 0 ||
                    price.tip > 0 ||
                    price.discount > 0) && (
                    <>
                      <TotalRow
                        label={t.publicMenu.subtotal}
                        value={fmt(price.subtotal)}
                      />
                      {/* Directly under the subtotal, because that is the order
                          the arithmetic happens in: the code comes off the
                          basket before service and tax are added. Signed like
                          the rounding row below, so it reads as a subtraction
                          rather than as another charge. */}
                      {price.discount > 0 && (
                        <TotalRow
                          label={t.publicMenu.discountSaving}
                          value={fmt(-price.discount)}
                        />
                      )}
                      {price.serviceCharge > 0 && (
                        <TotalRow
                          label={t.publicMenu.serviceCharge}
                          value={fmt(price.serviceCharge)}
                        />
                      )}
                      {price.tax > 0 && (
                        <TotalRow label={t.publicMenu.tax} value={fmt(price.tax)} />
                      )}
                      {price.roundingAdjustment !== 0 && (
                        <TotalRow
                          label={t.publicMenu.rounding}
                          value={fmt(price.roundingAdjustment)}
                        />
                      )}
                      {price.tip > 0 && (
                        <TotalRow label={t.publicMenu.tip} value={fmt(price.tip)} />
                      )}
                    </>
                  )}

                  <div className="flex items-center justify-between gap-4 pt-0.5">
                    <span className="font-semibold opacity-70">{t.publicMenu.total}</span>
                    <span className="text-lg font-extrabold tabular-nums">
                      <bdi>{fmt(price.total)}</bdi>{" "}
                      <span className="text-xs font-normal opacity-70">
                        {t.common.toman}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* Tip is offered at the details step, once the guest has
                  committed to ordering rather than while they are still
                  assembling the basket. */}
              {data.restaurant.tipEnabled &&
                data.restaurant.showPrices &&
                step === "details" &&
                !preview && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold opacity-70">
                      {t.publicMenu.addTip}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <TipChip
                        label={t.publicMenu.noTip}
                        active={tipPercent === 0}
                        onClick={() => setTipPercent(0)}
                      />
                      {data.restaurant.tipPercents.map((percent) => (
                        <TipChip
                          key={percent}
                          label={`${localizeDigits(percent, locale)}٪`}
                          active={tipPercent === percent}
                          onClick={() => setTipPercent(percent)}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {/*
                Only when the venue has switched it on. A field asking for a
                code the venue does not issue reads as a discount the guest is
                failing to find, so a venue between promotions shows nothing.

                Shown at the details step alongside the tip, for the same
                reason: it belongs to paying, not to assembling the basket. No
                amount is shown here because none is known yet — the code is
                worth whatever the server says it is worth, and it says so when
                the order is placed.
              */}
              {data.restaurant.discountCodesEnabled &&
                data.restaurant.showPrices &&
                step === "details" &&
                !preview && (
                  <div>
                    <label
                      htmlFor="discount-code"
                      className="mb-1.5 block text-xs font-semibold opacity-70"
                    >
                      {t.publicMenu.discountCode}
                    </label>
                    {/* Field and button on one row. `gap` and the logical
                        padding below keep this correct in both directions
                        without a single left/right anywhere. */}
                    <div className="flex items-center gap-2">
                      <input
                        id="discount-code"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value)}
                        maxLength={24}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        // Codes are Latin characters even on a Persian menu, so
                        // the field reads left-to-right whatever the page does.
                        dir="ltr"
                        className="tap-safe h-12 min-w-0 flex-1 rounded-[var(--m-radius-sm)] border px-3 text-sm font-bold tracking-wider uppercase"
                        style={{
                          borderColor: "var(--m-border)",
                          background: "var(--m-surface-bg)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={checkDiscount}
                        disabled={checkingDiscount || !discountCode.trim()}
                        className="tap-safe h-12 shrink-0 rounded-[var(--m-radius-sm)] border px-4 text-xs font-extrabold disabled:opacity-50"
                        style={{
                          borderColor: "var(--m-border)",
                          color: "var(--m-primary)",
                        }}
                      >
                        {checkingDiscount
                          ? t.publicMenu.discountChecking
                          : t.publicMenu.discountApply}
                      </button>
                    </div>

                    {/*
                      The outcome, either way. `role="status"` rather than
                      `alert`: a code that did not apply is an ordinary answer
                      to a question the guest asked, not an error condition, and
                      it should not interrupt a screen reader mid-sentence.
                    */}
                    {appliedDiscount && (
                      <p
                        role="status"
                        className="mt-1.5 text-xs font-semibold"
                        style={{ color: "var(--m-primary)" }}
                      >
                        {t.publicMenu.discountApplied.replace(
                          "{code}",
                          appliedDiscount.code,
                        )}
                        {" — "}
                        <bdi className="tabular-nums">
                          {fmt(appliedDiscount.amount)} {t.common.toman}
                        </bdi>
                      </p>
                    )}

                    {discountReason && !appliedDiscount && (
                      <p
                        role="status"
                        className="mt-1.5 text-xs font-semibold opacity-70"
                      >
                        {discountReason}
                      </p>
                    )}
                  </div>
                )}

              {preview ? (
                <p className="rounded-[var(--m-radius-sm)] bg-black/5 p-3 text-center text-xs font-semibold opacity-70">
                  {t.common.preview}
                </p>
              ) : step === "cart" ? (
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="h-12 w-full rounded-full text-sm font-extrabold transition-transform active:scale-[0.98]"
                  style={{
                    background: "var(--m-primary)",
                    color: "var(--m-primary-contrast)",
                  }}
                >
                  {t.publicMenu.checkout}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitOrder}
                  disabled={submitting}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold transition-transform active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: "var(--m-primary)",
                    color: "var(--m-primary-contrast)",
                  }}
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {submitting ? t.publicMenu.placingOrder : t.publicMenu.placeOrder}
                </button>
              )}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

function PaymentOption({
  checked,
  onSelect,
  icon,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-3 rounded-[var(--m-radius-sm)] border p-3 transition-colors"
      style={{
        borderColor: checked ? "var(--m-primary)" : "var(--m-border)",
        background: checked ? "var(--m-primary-soft)" : "transparent",
      }}
    >
      <input
        type="radio"
        name="payment-method"
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span style={{ color: checked ? "var(--m-primary)" : "inherit" }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs opacity-60">{hint}</span>
      </span>
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full border-2"
        style={{ borderColor: checked ? "var(--m-primary)" : "var(--m-border)" }}
      >
        {checked && (
          <span
            className="size-2.5 rounded-full"
            style={{ background: "var(--m-primary)" }}
          />
        )}
      </span>
    </label>
  );
}

/** One line of the cart's bill breakdown. */
function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs opacity-80">
      <span>{label}</span>
      {/* Isolated so the amount cannot merge with adjacent digits in RTL. */}
      <bdi className="tabular-nums">{value}</bdi>
    </div>
  );
}

function TipChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="tap-safe min-w-14 rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
      style={{
        background: active ? "var(--m-primary)" : "var(--m-surface-2, rgba(0,0,0,0.05))",
        color: active ? "var(--m-primary-contrast)" : "inherit",
      }}
    >
      {label}
    </button>
  );
}
