"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, Search, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client-api";
import { useCart } from "./cart";
import { useMenu } from "./runtime";
import { formatMoney, formatNumber, localizeDigits, toEnglishDigits } from "@/lib/format";
import type { MenuCategory } from "../types";
import { localizeApiError } from "@/lib/api-error";

/**
 * Chrome shared by every template: search, cart affordances and category
 * scroll-spy. Templates decide where these go and how they look; the behaviour
 * is defined once here.
 */

export function useMenuSearch(categories: MenuCategory[]) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;

    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter((p) =>
          [p.name, p.nameEn, p.shortDescription]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q)),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [categories, query]);

  return { query, setQuery, filtered, isSearching: query.trim().length > 0 };
}

/**
 * Highlights the category the reader is currently in.
 *
 * The rule is a **reading line across the middle of the screen**: whichever
 * category has most recently crossed it is the one you are in.
 *
 * The obvious alternative — "which heading has passed the top of the screen?" —
 * switches far too eagerly. A heading only has to clear the sticky bar to win,
 * so the chip jumps to the next category while most of the screen still shows
 * the previous one's dishes: you are still reading burgers and the rail already
 * says pizza. Moving the line to the middle means a category takes the
 * highlight only once it actually owns the half of the screen you are looking
 * at, which is the thing the highlight is supposed to be telling you.
 *
 * Measured against the section top rather than its midpoint, because sections
 * vary wildly in height — a two-dish category and a twenty-dish category should
 * both take over when their content arrives at the middle, not when their
 * centre happens to.
 *
 * Two ends of the page still need care:
 *
 *   * at the very top no heading has reached the middle yet, so the first
 *     category is the answer — which is what the initial value gives;
 *   * at the very bottom the final heading may never reach the middle, because
 *     the document runs out first. That end is special-cased, otherwise the
 *     last chip could never light however far you scrolled.
 *
 * `ids` is rebuilt on every render by the callers (`filtered.map(c => c.id)`),
 * so the effect keys on the joined string instead — otherwise it tore down and
 * re-subscribed on every keystroke in the search field.
 */
/**
 * The element a menu actually scrolls inside.
 *
 * On a real menu that is the document — the page itself scrolls. Inside the
 * dashboard's design preview it is a `div` with its own `overflow-y: auto`, and
 * that difference was a live bug: everything below listened to `window` and
 * measured `window.innerHeight`, so in the preview the *dashboard's* scrolling
 * drove the highlight while scrolling inside the phone did nothing at all. The
 * preview appeared to lurch on its own whenever the page moved.
 *
 * Returns `null` for the document case so callers can fall back to `window`,
 * which is the only thing that reports document scrolling.
 */
function getScrollContainer(el: Element | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    /*
      Declared overflow only — deliberately not `scrollHeight > clientHeight`.

      That extra test looked safer and was the bug: this runs on mount, before
      images have loaded and laid the menu out, so the preview had not yet grown
      past its own height and reported itself unscrollable. The hook then fell
      back to `window` for the rest of its life and never re-checked, which is
      the same wrong-viewport failure in a new disguise. An element that
      declares `overflow-y: auto` is the scroll parent whether or not it happens
      to overflow at this instant.
    */
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function useActiveCategory(ids: string[]): string | null {
  const [active, setActive] = React.useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");

  React.useEffect(() => {
    const list = key ? key.split("|") : [];
    if (list.length === 0) return;

    // Resolved once per subscription from a heading that is definitely inside
    // whatever scrolls, rather than assumed to be the window.
    const scroller = getScrollContainer(document.getElementById(`cat-${list[0]}`));

    /*
     * Measured straight from the scroll handler rather than deferred into a
     * requestAnimationFrame callback. rAF does not run in a backgrounded tab,
     * which would freeze the highlight on whatever it was when the guest
     * switched away — and a menu has a handful of headings, so reading their
     * offsets is far cheaper than the scrolling itself.
     */
    const pick = () => {
      // Bottom of the scroll, whichever thing is scrolling. Without the
      // container branch the preview could never light its last chip: the
      // document behind it may not scroll at all.
      if (scroller) {
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
          setActive(list[list.length - 1]!);
          return;
        }
      } else if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        setActive(list[list.length - 1]!);
        return;
      }

      // Read fresh every time: the viewport height changes when a mobile
      // browser's address bar collapses mid-scroll, and a stale line would
      // drift from the middle of the screen the guest is actually looking at.
      //
      // Expressed in viewport coordinates so it can be compared against
      // `getBoundingClientRect()` below in either case — for a container that
      // means the middle of the container, not of the window.
      const readingLine = scroller
        ? scroller.getBoundingClientRect().top + scroller.clientHeight / 2
        : window.innerHeight / 2;

      // The last heading to have crossed the middle. Falls back to the first,
      // which is correct before any of them has.
      let current = list[0]!;
      for (const id of list) {
        const el = document.getElementById(`cat-${id}`);
        if (el && el.getBoundingClientRect().top <= readingLine) current = id;
      }
      setActive(current);
    };

    /*
     * Two triggers, because neither alone is sufficient.
     *
     * The scroll listener is what drives this during ordinary reading. The
     * observer is a second trigger that fires whenever a section crosses the
     * viewport edge — including when the page reflows, an image finally loads
     * and shifts everything down, or the menu is filtered by a search. Those
     * move the headings without any scrolling, and a scroll-only version would
     * keep highlighting whatever was under the bar beforehand.
     *
     * Both call the same rule, so they cannot disagree.
     */
    const observer = new IntersectionObserver(pick, {
      // Scoped to the same thing that scrolls. With the default root the
      // observer watches the browser viewport, so inside the preview it fired
      // on *dashboard* scrolling — the other half of the same bug.
      root: scroller,
      // A zero-height band across the middle of the root — the same line the
      // rule above uses, so the observer fires exactly on the crossings that
      // can change the answer.
      rootMargin: "-50% 0px -50% 0px",
      threshold: 0,
    });
    for (const id of list) {
      const el = document.getElementById(`cat-${id}`);
      if (el) observer.observe(el);
    }

    // Deferred by a tick so the effect body itself performs no setState, which
    // is what `react-hooks/set-state-in-effect` is guarding against.
    const initial = setTimeout(pick, 0);
    // Bound to the scroller, not the window. This is what makes scrolling
    // inside the preview drive its own highlight, and scrolling the dashboard
    // leave it alone.
    const target: EventTarget = scroller ?? window;
    target.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);

    return () => {
      clearTimeout(initial);
      observer.disconnect();
      target.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [key]);

  return active;
}

/**
 * Scrolls a category heading clear of the sticky bar.
 *
 * This used to compute the target itself — `rect.top + scrollY - 88` — and that
 * 88 was wrong on every template except by accident. The bar is 64px tall on
 * Ember and 123px on Qalam, so the same constant left a gap under the heading
 * on one and hid the heading *behind* the bar on the other. That is the "I tap
 * a category and it doesn't show properly" case.
 *
 * Each template already declares the right number as `scroll-mt-*` on its own
 * sections, sized to its own bar. `scrollIntoView` honours that
 * `scroll-margin-top`; `window.scrollTo` cannot, because it takes a raw
 * coordinate and knows nothing about the element. So the offset now lives in
 * exactly one place per template — the markup — and a template that changes its
 * header height fixes this by changing the class it already sets.
 */
export function scrollToCategory(id: string) {
  const el = document.getElementById(`cat-${id}`);
  if (!el) return;

  const scroller = getScrollContainer(el);

  // The real page: nothing else scrolls, so let the browser do it and honour
  // `scroll-margin-top` for free.
  if (!scroller) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  /*
    Inside a scroll container, scroll only that container.

    `scrollIntoView` walks every scrollable ancestor, so in the design preview
    tapping a chip scrolled the phone *and* the dashboard page behind it — the
    owner tapped a category and the whole editor jumped. Scrolling the
    container directly keeps the movement where the tap was.

    `scroll-margin-top` is read off the element rather than assumed, because
    that is the entire reason `scrollIntoView` was used here: each template
    sets its own value sized to its own sticky bar.
  */
  const marginTop = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const delta =
    el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - marginTop;

  scroller.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * The category rail every template shows under its header. Previously each
 * template hand-rolled this; consolidating it means tap-target sizing, snap
 * scrolling and keeping the active chip in view are fixed in one place.
 *
 * `variant` covers the only real visual difference between the four: pill
 * chips versus an underlined tab row.
 */
export function CategoryChips({
  categories,
  activeId,
  variant = "pill",
  className,
}: {
  categories: MenuCategory[];
  activeId: string | null;
  variant?: "pill" | "underline";
  className?: string;
}) {
  const { t } = useMenu();
  const railRef = React.useRef<HTMLElement>(null);

  // A long menu pushes the active chip off-screen as the reader scrolls; pull
  // it back into view so the rail always reflects where they actually are.
  React.useEffect(() => {
    if (!activeId || !railRef.current) return;
    const chip = railRef.current.querySelector<HTMLElement>(`[data-cat="${activeId}"]`);
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  if (categories.length < 2) return null;

  return (
    // No edge-bleed here on purpose. A hard-coded `-mx-4` only lines up with a
    // `px-4` parent; against Aurora's `px-3` header it overflowed the page by
    // 4px on each side. Each template passes the bleed that matches its own
    // padding instead.
    <nav
      ref={railRef}
      aria-label={t.dashboard.categories}
      // gap-2 (8px) is the minimum spacing between adjacent touch targets;
      // tighter and thumbs start hitting the neighbouring category.
      className={cn("chip-rail gap-2", className)}
    >
      {categories.map((category) => {
        const isActive = activeId === category.id;
        const name = category.name;

        return (
          <button
            key={category.id}
            data-cat={category.id}
            type="button"
            onClick={() => scrollToCategory(category.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center px-4 text-sm font-bold whitespace-nowrap",
              "transition-[background-color,color,opacity] duration-200",
              variant === "pill" ? "rounded-full" : "border-b-2",
            )}
            style={
              variant === "pill"
                ? isActive
                  ? { background: "var(--m-primary)", color: "var(--m-primary-contrast)" }
                  : {
                      background: "var(--m-primary-soft)",
                      color: "var(--m-text)",
                      opacity: 0.75,
                    }
                : isActive
                  ? { borderColor: "var(--m-primary)", color: "var(--m-primary)" }
                  : { borderColor: "transparent", color: "var(--m-text)", opacity: 0.55 }
            }
          >
            {name}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Guest-facing language toggle.
 *
 * Renders only for venues that actually offer a second language — a toggle on a
 * menu with no English content would hand a tourist a mostly-Persian page and
 * read as broken rather than as untranslated.
 *
 * Labelled with the language it switches *to*, in that language's own script,
 * which is legible to the reader who wants it whether or not they read the
 * current one.
 */
export function LanguageToggle({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t, locale, data, preview } = useMenu();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (!data.restaurant.bilingualEnabled) return null;

  const next = locale === "fa" ? "en" : "fa";

  async function switchTo() {
    // Inside the dashboard previewer there is no real guest and no cookie worth
    // writing; the owner is looking at a rendering, not browsing a menu.
    if (preview || busy) return;
    setBusy(true);
    await api.post("/api/menu-locale", { slug: data.restaurant.slug, locale: next });
    router.refresh();
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={busy}
      aria-label={
        next === "en" ? t.publicMenu.switchToEnglish : t.publicMenu.switchToPersian
      }
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-xs font-black transition-transform active:scale-95 disabled:opacity-50",
        className,
      )}
      style={style}
    >
      {/* The target language names itself, so it stays readable to the guest
          who is looking for it. Latin text must not mirror inside an RTL menu. */}
      <span dir={next === "en" ? "ltr" : "rtl"}>{next === "en" ? "EN" : "فا"}</span>
    </button>
  );
}

export function CartButton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const cart = useCart();
  const { t, locale } = useMenu();

  return (
    <button
      type="button"
      onClick={cart.open}
      aria-label={`${t.publicMenu.cart}${cart.count ? ` (${cart.count})` : ""}`}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95",
        className,
      )}
      style={style}
    >
      <ShoppingBag className="size-5" />
      {cart.count > 0 && (
        <span
          className="absolute -end-0.5 -top-0.5 grid min-w-5 animate-[scale-in_0.2s_ease-out] place-items-center rounded-full px-1 text-[10px] font-extrabold tabular-nums"
          style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
        >
          {formatNumber(cart.count, locale)}
        </span>
      )}
    </button>
  );
}

/** Thumb-reachable summary bar; appears only once something is in the cart. */
/**
 * The bottom action area: the staff-call button and the cart bar.
 *
 * Both live here because every template already renders `<CartBar />` at its
 * foot — routing the call button through the same component gives all six
 * templates the feature without touching any of them, and keeps the two from
 * fighting over the same fixed position above the home indicator.
 */
export function CartBar() {
  const cart = useCart();
  const { t, locale, data, preview } = useMenu();

  const showStaffCall = data.restaurant.staffCallEnabled && !preview;
  const showCart = cart.count > 0 && !preview;

  if (!showStaffCall && !showCart) return null;
  const fmt = (n: number) => formatMoney(n, locale);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showStaffCall && <StaffCallButton />}
      {showCart && (
        <button
          type="button"
          onClick={cart.open}
          className="mx-auto flex h-14 w-full max-w-md animate-[fade-up_0.3s_cubic-bezier(0.22,1,0.36,1)] items-center gap-3 rounded-full px-5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-transform active:scale-[0.98]"
          style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-extrabold tabular-nums">
            {formatNumber(cart.count, locale)}
          </span>
          <span className="flex-1 text-start text-sm font-extrabold">
            {t.publicMenu.cart}
          </span>
          {data.restaurant.showPrices && (
            <span className="text-sm font-extrabold tabular-nums">
              <bdi>{fmt(cart.subtotal)}</bdi>{" "}
              <span className="text-xs font-normal opacity-80">{t.common.toman}</span>
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * "Call the waiter".
 *
 * The table number is what identifies the caller, so it is asked for once and
 * pre-filled when the guest arrived through a table QR code — in that case
 * there is nothing to type and the call is a single tap. Sending goes to the
 * dashboard over the existing event stream; nothing is texted anywhere.
 */
function StaffCallButton() {
  const { t, locale, data, presetTable } = useMenu();
  const [open, setOpen] = React.useState(false);
  const [table, setTable] = React.useState(presetTable ?? "");
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  async function send() {
    const trimmed = toEnglishDigits(table.trim());
    if (!trimmed) {
      setState("error");
      setMessage(t.publicMenu.staffCallNeedsTable);
      return;
    }

    setState("sending");
    try {
      const response = await fetch("/api/public/staff-call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: data.restaurant.slug, tableNumber: trimmed }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setState("error");
        setMessage(payload?.error ? localizeApiError(payload.error, t) : t.common.error);
        return;
      }

      setState("sent");
      setMessage(t.publicMenu.staffCallSent);
      // Collapse the panel once the guest has read the confirmation.
      window.setTimeout(() => {
        setOpen(false);
        setState("idle");
        setMessage(null);
      }, 2500);
    } catch {
      setState("error");
      setMessage(t.common.error);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-safe inline-flex h-11 items-center gap-2 rounded-full px-4 text-xs font-extrabold shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-transform active:scale-[0.98]"
        style={{
          background: "var(--m-surface)",
          color: "var(--m-primary)",
          border: "1px solid var(--m-border)",
        }}
      >
        <BellRing className="size-4 shrink-0" />
        {data.restaurant.staffCallLabel}
      </button>
    );
  }

  return (
    <div
      className="w-full max-w-md rounded-[var(--m-radius)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
      style={{
        background: "var(--m-surface)",
        color: "var(--m-text)",
        border: "1px solid var(--m-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-extrabold">
          <BellRing className="size-4 shrink-0" style={{ color: "var(--m-primary)" }} />
          {data.restaurant.staffCallLabel}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t.common.close}
          className="tap-safe grid size-8 place-items-center rounded-full"
        >
          <X className="size-4" />
        </button>
      </div>

      {state === "sent" ? (
        <p
          className="py-2 text-center text-sm font-bold"
          style={{ color: "var(--m-primary)" }}
        >
          {message}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              value={table}
              onChange={(event) => setTable(event.target.value)}
              inputMode="numeric"
              placeholder={t.publicMenu.tableNumberPlaceholder}
              aria-label={t.publicMenu.tableNumber}
              className="h-11 min-w-0 flex-1 rounded-[var(--m-radius-sm)] px-3 text-sm"
              style={{
                background: "var(--m-bg)",
                border: "1px solid var(--m-border)",
                color: "var(--m-text)",
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={state === "sending"}
              className="tap-safe h-11 shrink-0 rounded-[var(--m-radius-sm)] px-4 text-sm font-extrabold disabled:opacity-60"
              style={{
                background: "var(--m-primary)",
                color: "var(--m-primary-contrast)",
              }}
            >
              {state === "sending"
                ? t.publicMenu.staffCallSending
                : t.publicMenu.staffCallSend}
            </button>
          </div>
          {state === "error" && message && (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
              {message}
            </p>
          )}
          <p className="mt-2 text-[11px] opacity-60">
            {localizeDigits(t.publicMenu.staffCallHint, locale)}
          </p>
        </>
      )}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useMenu();

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 opacity-50"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.publicMenu.searchPlaceholder}
        aria-label={t.publicMenu.searchPlaceholder}
        className="h-11 w-full rounded-full border px-10 text-sm transition-colors outline-none"
        style={{
          background: "var(--m-bg)",
          borderColor: "var(--m-border)",
          color: "var(--m-text)",
          ...style,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t.common.close}
          className="tap-safe absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Rendered when a search returns nothing, or the menu has no products yet. */
export function MenuEmpty({ message }: { message: string }) {
  return (
    <div className="px-6 py-20 text-center">
      <p className="text-sm font-semibold opacity-60">{message}</p>
    </div>
  );
}
