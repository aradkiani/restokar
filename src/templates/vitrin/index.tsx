"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Clock, MoveHorizontal } from "lucide-react";
import type { MenuCategory, MenuProduct, TemplateProps } from "../types";
import { useAddToCart, useMenu } from "../shared/runtime";
import { DishTagFilter, DishTagIcons } from "../shared/dish-tags";
import { useCart } from "../shared/cart";
import {
  CartBar,
  CartButton,
  LanguageToggle,
  MenuEmpty,
  SearchField,
  scrollToCategory,
  useActiveCategory,
  useMenuSearch,
} from "../shared/chrome";
import {
  AddToCartButton,
  PriceTag,
  ProductImage,
  UnavailableOverlay,
} from "../shared/pieces";
import { MenuFooter } from "../shared/footer";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * Vitrin — one dish at a time, filling the screen, dealt like a deck of cards.
 *
 * Every other template answers "what does this venue sell?" by showing as much
 * of the menu at once as it can. This one refuses to: a single dish occupies
 * roughly four-fifths of the screen and the rest of the category sits behind it
 * as a visible stack, so the guest meets one photograph at full size instead of
 * forty thumbnails. It is the right trade for a short, photographed menu where
 * each dish is worth looking at — a specials board, a tasting list, a burger
 * shop with eight things on it — and the wrong one for a hundred-line
 * sofreh-khaneh, which is what Linen and Bazaar are for.
 *
 * Reel is the other template built on sideways movement, and the difference is
 * the point: Reel is a *browsing* surface, several small cards per screen with
 * the next peeking in. Vitrin is a *presentation* surface, one card, no
 * competition for attention.
 *
 * Three things the pattern gets wrong by default, and what is done about them:
 *
 *   * **A swipe is invisible.** Nothing in a static card says it can be thrown
 *     aside. So the cards behind it are drawn — offset, scaled and dimmed — and
 *     a hint sits under the deck until the guest moves the first card. A stack
 *     that looks like a stack is the only affordance that needs no instruction.
 *   * **A swipe is not an input method.** It cannot be tabbed to, it means
 *     nothing to a screen reader and it is unavailable to anyone using a
 *     keyboard. Every gesture here is duplicated by a real button and by the
 *     arrow keys, and the position is announced politely as it changes.
 *   * **A horizontal drag fights the page.** The card takes `touch-action:
 *     pan-y`, so the browser keeps vertical scrolling for itself and hands over
 *     only the horizontal axis. The page still scrolls normally with a thumb
 *     anywhere on the deck.
 *
 * Categories are laid out one under another, each with its own deck, rather
 * than one deck whose contents swap when a category is chosen. Two reasons: a
 * guest can see at a glance that the venue sells four things and not one, and
 * scrolling down is how every other menu in the world is read — the sideways
 * gesture is then an addition to that rather than a replacement for it.
 */
export default function VitrinTemplate({ data }: TemplateProps) {
  const { t, locale, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { query, setQuery, tags, setTags, filtered, isSearching } = useMenuSearch(
    data.categories,
  );
  const { restaurant } = data;

  // Categories stack down the page, so the rail reflects where the reader
  // actually is rather than what they last tapped.
  const activeId = useActiveCategory(filtered.map((category) => category.id));

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            loading="eager"
            className="size-11 shrink-0 object-cover"
            style={{ borderRadius: "var(--m-radius)" }}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {/*
            Tight tracking is a Latin typographic habit and is forbidden on
            Persian: the letters join, and pulling them apart breaks the word.
            The weight and size carry the hierarchy instead.
          */}
          <h1 className="truncate text-xl leading-tight font-black">{restaurant.name}</h1>
          {restaurant.tagline && (
            <p className="truncate text-xs leading-5 opacity-60">{restaurant.tagline}</p>
          )}
        </div>

        <LanguageToggle
          style={{ background: "var(--m-surface)", color: "var(--m-text)" }}
        />
        <CartButton
          style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
        />
      </header>

      <div className="px-4 pb-3">
        <SearchField value={query} onChange={setQuery} />
        <DishTagFilter value={tags} onChange={setTags} className="mt-2" />
      </div>

      {filtered.length === 0 ? (
        <MenuEmpty message={t.common.empty} />
      ) : isSearching ? (
        /*
         * Search abandons the deck entirely.
         *
         * Dealing three matches as a stack would hide two of them behind the
         * first and make the guest swipe to find out whether their search
         * worked. A result list is the one moment this template's whole premise
         * — one thing at a time — is the wrong answer, so it steps aside.
         */
        <main id="main" className="flex-1 px-4 pb-8">
          <ul className="flex flex-col gap-2">
            {filtered.flatMap((category) =>
              category.products.map((product) => (
                <SearchRow
                  key={product.id}
                  product={product}
                  showPrices={restaurant.showPrices}
                  canOrder={restaurant.onlineOrderingEnabled}
                  locale={locale}
                  addLabel={t.publicMenu.addToCart}
                  inCart={cart.quantityOf(product.id)}
                  onOpen={() => openProduct(product)}
                  onAdd={() => addToCart(product)}
                />
              )),
            )}
          </ul>
        </main>
      ) : (
        <>
          <div className="sticky top-0 z-30 pt-1" style={{ background: "var(--m-bg)" }}>
            <CategoryRail categories={filtered} activeId={activeId} />
          </div>

          <main id="main" className="flex-1 pt-2">
            {filtered.map((category) => (
              <CategorySection key={category.id} category={category} />
            ))}
          </main>
        </>
      )}

      <MenuFooter />

      <CartBar />
    </div>
  );
}

/**
 * One category: a heading, then that category's own deck.
 *
 * The heading is set against a rule that runs to the edge of the column, which
 * is what makes a section read as *separate* rather than as more of the
 * previous one. On a layout where each item is the size of a poster, the
 * boundaries between groups have to be at least as loud as the items, or the
 * whole menu reads as one undifferentiated pile of cards.
 *
 * `scroll-mt-28` matches the sticky rail above it, so jumping to a category
 * lands its heading below the bar rather than behind it. Every template sets
 * this to its own bar height — see the note on `scrollToCategory`.
 */
function CategorySection({ category }: { category: MenuCategory }) {
  const { locale } = useMenu();
  const count = category.products.length;

  return (
    <section id={`cat-${category.id}`} className="mb-10 scroll-mt-28">
      <div className="mb-3 flex items-baseline gap-3 px-4">
        <h2 className="min-w-0 text-lg leading-tight font-black">{category.name}</h2>

        <span
          aria-hidden
          className="h-px flex-1"
          style={{ background: "var(--m-border)" }}
        />

        <span className="shrink-0 text-xs font-bold tabular-nums opacity-45">
          <bdi>{formatNumber(count, locale === "fa" ? "fa" : "en")}</bdi>
        </span>
      </div>

      <Deck category={category} />
    </section>
  );
}

/**
 * The category index.
 *
 * Not the shared `CategoryChips`, which renders pills — at this scale a row of
 * filled pills competes with the deck's own controls for attention. A
 * rule-and-label row reads as an index instead. It still jumps via
 * `scrollToCategory`, so the behaviour matches every other template.
 */
function CategoryRail({
  categories,
  activeId,
}: {
  categories: MenuCategory[];
  activeId: string | null;
}) {
  const { t } = useMenu();
  const railRef = React.useRef<HTMLElement>(null);

  // Keep the chosen category in view when the list is longer than the screen.
  React.useEffect(() => {
    if (!activeId || !railRef.current) return;
    const chip = railRef.current.querySelector<HTMLElement>(`[data-cat="${activeId}"]`);
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  if (categories.length < 2) return null;

  return (
    <nav
      ref={railRef}
      aria-label={t.dashboard.categories}
      className="-mx-0 chip-rail gap-6 px-4 pb-3"
    >
      {categories.map((category) => {
        const isActive = activeId === category.id;
        return (
          <button
            key={category.id}
            data-cat={category.id}
            type="button"
            onClick={() => scrollToCategory(category.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "tap-safe relative inline-flex min-h-11 shrink-0 items-center",
              "text-sm font-black whitespace-nowrap transition-opacity duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-4",
            )}
            style={{
              color: isActive ? "var(--m-primary)" : "var(--m-text)",
              opacity: isActive ? 1 : 0.45,
              outlineColor: "var(--m-primary)",
            }}
          >
            {category.name}
            {/* The active marker is a bar under the word rather than a filled
                pill: at this weight a solid background would out-shout the
                dish photograph, which is the only thing on screen that should
                be loud. */}
            <span
              aria-hidden
              className="absolute inset-x-0 -bottom-0.5 h-0.5 transition-opacity duration-200"
              style={{
                background: "var(--m-primary)",
                opacity: isActive ? 1 : 0,
              }}
            />
          </button>
        );
      })}
    </nav>
  );
}

/** How far the card must travel before release counts as a discard. */
const COMMIT_RATIO = 0.22;

/** Movement below this is a tap, not a drag — thumbs are never perfectly still. */
const TAP_SLOP_PX = 8;

/** Safety net in case `transitionend` never arrives (interrupted animation). */
const FLIGHT_MS = 320;

/**
 * How decisive a sideways trackpad flick has to be before it turns a card.
 *
 * Well above the few pixels of horizontal drift that ride along with an
 * ordinary vertical scroll, and well below a deliberate two-finger flick.
 */
const WHEEL_COMMIT_PX = 24;

/**
 * One gesture, one card.
 *
 * A trackpad does not emit a single wheel event; it emits a burst followed by a
 * decaying momentum tail that can run for hundreds of milliseconds. Without a
 * cooldown a single flick would race through the whole category.
 */
const WHEEL_COOLDOWN_MS = 340;

/**
 * One category, dealt as a stack.
 *
 * Featured dishes are moved to the front. A venue that has marked something as
 * featured has already said which dish should meet the guest first, and in a
 * layout that only shows one at a time that flag decides the entire first
 * impression rather than adding a small badge somewhere.
 */
function Deck({ category }: { category: MenuCategory }) {
  const { t, locale, data, openProduct } = useMenu();
  const cart = useCart();
  const addToCart = useAddToCart();
  const { restaurant } = data;

  const products = React.useMemo(() => {
    const featured = category.products.filter((p) => p.isFeatured);
    const rest = category.products.filter((p) => !p.isFeatured);
    return [...featured, ...rest];
  }, [category.products]);

  const count = products.length;
  const [index, setIndex] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [flying, setFlying] = React.useState<-1 | 0 | 1>(0);
  const [hinted, setHinted] = React.useState(false);

  const deckRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ id: number; x: number; y: number; axis: "?" | "x" } | null>(
    null,
  );

  /**
   * Advance by one, wrapping.
   *
   * Wrapping rather than stopping at the end: the deck is a menu, not a form,
   * and a guest who reaches the last dish and keeps swiping wants to see the
   * first one again, not a dead card that ignores them.
   */
  const step = React.useCallback(
    (direction: 1 | -1) => {
      if (count < 2) return;
      setHinted(true);
      setIndex((current) => (current + direction + count) % count);
    },
    [count],
  );

  /** Throws the top card out, then advances once it has left. */
  const fling = React.useCallback(
    (direction: 1 | -1) => {
      if (count < 2) {
        setOffset(0);
        return;
      }
      setHinted(true);
      setFlying(direction);
    },
    [count],
  );

  // `transitionend` is the primary signal; the timer only covers the case where
  // it never fires because the animation was interrupted or motion is reduced
  // to near-zero and the browser skips the event.
  React.useEffect(() => {
    if (flying === 0) return;
    const timer = window.setTimeout(() => settle(flying), FLIGHT_MS + 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying]);

  function settle(direction: -1 | 1) {
    setIndex((current) => (current + direction + count) % count);
    setFlying(0);
    setOffset(0);
  }

  /**
   * Which physical direction means "forward".
   *
   * Read from the resolved computed style rather than from the locale, for the
   * same reason Reel reads it there: a drag delta is a physical measurement,
   * and deriving its meaning from `locale === "fa"` is a second source of truth
   * that disagrees with the DOM the moment Persian content renders inside an
   * LTR page. Forward is leftwards in an LTR deck and rightwards in an RTL one.
   */
  function forwardSign(): 1 | -1 {
    const el = deckRef.current;
    const rtl = el ? getComputedStyle(el).direction === "rtl" : locale === "fa";
    return rtl ? 1 : -1;
  }

  function onPointerDown(event: React.PointerEvent) {
    if (flying !== 0 || count < 2) return;
    // Ignore secondary buttons so a right-click never starts a drag.
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: "?" };
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;

    if (state.axis === "?") {
      // Wait until the gesture has declared itself. `touch-action: pan-y` means
      // a vertical drag is already scrolling the page natively and must not
      // also move the card.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > TAP_SLOP_PX) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) <= TAP_SLOP_PX) return;
      state.axis = "x";
      // Capture keeps the card following a thumb that slides off its edge.
      // It throws if the pointer has already been released — a fast flick can
      // land `pointerup` first — and an exception thrown from a move handler
      // would abandon the gesture mid-drag with the card stranded off-centre.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* pointer already gone; the drag still tracks via clientX */
      }
      setHinted(true);
    }

    setOffset(dx);
  }

  function onPointerUp(event: React.PointerEvent) {
    const state = drag.current;
    drag.current = null;
    if (!state || state.id !== event.pointerId) return;

    if (state.axis !== "x") return;

    const width = deckRef.current?.clientWidth ?? 320;
    const travelled = event.clientX - state.x;

    if (Math.abs(travelled) > width * COMMIT_RATIO) {
      // Thrown far enough: send it out the way it was going. Dragging against
      // the reading direction steps backwards, which is what makes the gesture
      // reversible rather than a one-way discard.
      const physical: 1 | -1 = travelled < 0 ? -1 : 1;
      fling(physical);
    } else {
      setOffset(0);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const physical: 1 | -1 = event.key === "ArrowLeft" ? -1 : 1;
    // Left always means "the card leaves leftwards"; whether that is forward or
    // back depends on the script, and `forwardSign` is the single answer to it.
    step(physical === forwardSign() ? 1 : -1);
  }

  /**
   * Sideways trackpad and wheel gestures.
   *
   * The pointer handlers above already cover a thumb on glass and a mouse drag,
   * because both arrive as pointer events. A two-finger swipe on a trackpad
   * does not: the OS turns it into `wheel` with a horizontal `deltaX` and no
   * pointer ever goes down. So on a laptop — which is where an owner actually
   * designs their menu — the deck looked like it could only be clicked, which
   * is exactly the report this fixes.
   *
   * Bound by hand rather than with `onWheel` because React registers wheel
   * listeners as passive, and a passive listener cannot call `preventDefault`.
   * Without that call the same flick reaches the browser as a history gesture
   * and the owner navigates backwards out of the page they were designing.
   */
  React.useEffect(() => {
    const deck = deckRef.current;
    if (!deck || count < 2) return;

    let cooling = false;
    let timer: number | undefined;

    // An arrow bound to a const rather than a `function` declaration: a hoisted
    // declaration could in principle run before the null check above, so TypeScript
    // will not carry that narrowing of `deck` into its body.
    const onWheel = (event: WheelEvent) => {
      // Vertical wins ties: a thumb reading down the menu drifts sideways by a
      // pixel or two and must not turn cards while doing it.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if (Math.abs(event.deltaX) < WHEEL_COMMIT_PX) return;

      // Claimed even while cooling, so the momentum tail is swallowed here
      // instead of escaping to the browser as a back-navigation.
      event.preventDefault();
      if (cooling) return;

      cooling = true;
      timer = window.setTimeout(() => {
        cooling = false;
      }, WHEEL_COOLDOWN_MS);

      // Same reading as a drag: positive `deltaX` is content travelling
      // leftwards. Whether leftwards means forward is the script's business,
      // which is the one question `forwardSign` answers — read here off the
      // live element for the same reason it is there.
      const forward: 1 | -1 = getComputedStyle(deck).direction === "rtl" ? 1 : -1;
      const physical: 1 | -1 = event.deltaX > 0 ? -1 : 1;
      step(physical === forward ? 1 : -1);
    };

    deck.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      deck.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, [count, step]);

  if (count === 0) {
    return (
      <div className="px-4 py-10">
        <MenuEmpty message={t.common.empty} />
      </div>
    );
  }

  const current = products[index]!;

  /**
   * The cards showing behind the top one.
   *
   * Capped at `count - 1` so a two-dish category cannot wrap around and place
   * the *current* dish behind itself. That was harmless while these were drawn
   * as blank slabs; now that each one shows its own photograph it would render
   * the same picture twice and read as a bug.
   */
  const behind = [1, 2]
    .slice(0, Math.max(0, count - 1))
    .map((n) => products[(index + n) % count])
    .filter((p): p is MenuProduct => Boolean(p));

  const flyingOut = flying !== 0;
  const dx = flyingOut ? flying * (deckRef.current?.clientWidth ?? 400) * 1.35 : offset;
  // A small rotation makes the card feel thrown rather than slid. Capped so a
  // long drag never tips it far enough to look broken.
  const tilt = Math.max(-9, Math.min(9, dx / 26));
  const progress = Math.min(
    1,
    Math.abs(offset) / ((deckRef.current?.clientWidth ?? 320) * COMMIT_RATIO),
  );

  return (
    <section
      aria-roledescription="carousel"
      aria-label={category.name}
      /*
        `overflow-x: clip` because StackPeek offsets the buried cards past the
        deck's edge, and on a 320px screen the far side of that pile reached
        4px beyond the viewport — enough to make the whole document scroll
        sideways. Only the off-screen tail is clipped; the visible sliver that
        makes the swipe discoverable is inside the deck and untouched.

        `clip` and not `hidden`: hidden would make this a scroll container and
        a containing block, which breaks the sticky category headings above.
      */
      className="overflow-x-clip px-4"
    >
      <div
        ref={deckRef}
        // The deck is the keyboard target, not each card: a stack has one
        // interactive position, and tabbing into cards that are visually
        // buried would be a keyboard trap dressed as navigation.
        tabIndex={0}
        role="group"
        aria-label={category.name}
        onKeyDown={onKeyDown}
        className={cn(
          "relative w-full focus-visible:outline-2 focus-visible:outline-offset-4",
        )}
        style={{
          /*
            Roughly 60% of the screen.
            Down from 78%: with categories stacked rather than swapped, a card
            has to leave room for the next heading to peek in below it —
            otherwise each section fills the viewport exactly and the page gives
            no sign that anything follows.

            `--m-vh` is set by the dashboard's design preview to the mocked
            device's height. On the real page it is unset and this falls back to
            the true viewport, which is the same value. Without it the preview
            would size cards against the *dashboard* viewport — the exact
            mistake the old preview scroll-spy made.
          */
          height: "calc(var(--m-vh, 100dvh) * 0.6)",
          outlineColor: "var(--m-primary)",
        }}
      >
        {behind.map((product, i) => (
          <StackPeek
            /*
              Keyed by depth as well as product.

              Keying by product alone let React reuse one node as a dish moved
              from the second layer to the first, and the CSS transition on the
              offset then animated it between depths. Measured mid-flight, the
              visible sliver was anywhere between 2% and 7% depending on when
              you looked. A depth-keyed element mounts fresh at its resting
              position, so the pile is the same on every card.
            */
            key={`${i}-${product.id}`}
            product={product}
            depth={i + 1}
            lift={progress}
            showPhoto={restaurant.showProductPhotos}
          />
        ))}

        <VitrinCard
          /*
            Keyed by product, so advancing *replaces* the card rather than
            reusing the element.
            Without this the same node is re-rendered with the next dish while
            its transform returns from off-screen to zero — and because a
            transition is still attached, the incoming card visibly slid in
            from the edge it had just been thrown off. A fresh element has no
            previous transform to animate from, so it simply appears where it
            belongs.
          */
          key={current.id}
          product={current}
          position={index + 1}
          total={count}
          showPrices={restaurant.showPrices}
          showPhoto={restaurant.showProductPhotos}
          canOrder={restaurant.onlineOrderingEnabled}
          locale={locale}
          minutesLabel={t.publicMenu.minutes}
          unavailableLabel={t.publicMenu.unavailable}
          addLabel={t.publicMenu.addToCart}
          inCart={cart.quantityOf(current.id)}
          onOpen={() => openProduct(current)}
          onAdd={() => addToCart(current)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onTransitionEnd={(event) => {
            if (event.propertyName === "transform" && flying !== 0) settle(flying);
          }}
          dragging={drag.current?.axis === "x"}
          dx={dx}
          tilt={tilt}
        />
      </div>

      <DeckControls
        position={index + 1}
        total={count}
        locale={locale}
        hinted={hinted}
        previousLabel={t.common.previous}
        nextLabel={t.common.next}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
      />
    </section>
  );
}

/** How far each card behind is nudged past the one in front, as a % of width. */
const PEEK_PERCENT = 5;

/**
 * The next dish, showing as a sliver past the edge of the current one.
 *
 * This is the affordance that makes the gesture discoverable. A stack of cards
 * squared up behind each other is just a card with a shadow — nothing about it
 * says "sideways". A strip of the *next photograph* visible past the edge says
 * it without a word, and it is the one convention every phone user already
 * knows from their photo gallery.
 *
 * The offset is `inset-inline-*` rather than `translateX`, so it mirrors with
 * the script for free: the pile fans right in an English menu and left in a
 * Persian one, always toward the direction the top card is thrown.
 *
 * A 5% nudge against a 3% shrink leaves roughly 3.5% of the next card visible —
 * a strip wide enough to read as a photograph rather than as a border.
 *
 * It costs one extra image request per category, and that image is the very
 * next one the guest will see, so it is a preload rather than an expense.
 */
function StackPeek({
  product,
  depth,
  lift,
  showPhoto,
}: {
  product: MenuProduct;
  depth: number;
  lift: number;
  showPhoto: boolean;
}) {
  // The pile eases forward as the top card is dragged away, which reads as the
  // next dish stepping up to take its place.
  const shift = depth * PEEK_PERCENT - lift * PEEK_PERCENT * 0.35;
  const scale = 1 - depth * 0.03 + lift * 0.02;

  return (
    <div
      aria-hidden
      className="absolute top-0 h-full overflow-hidden"
      style={{
        /*
          Both inset edges, so the box keeps the card's exact width while
          sitting `shift` further toward the inline-end. Logical properties, so
          the pile fans right in an English menu and left in a Persian one
          without this file needing to know which it is.
        */
        insetInlineStart: `${shift}%`,
        insetInlineEnd: `${-shift}%`,
        transform: `scale(${scale})`,
        background: "var(--m-surface)",
        border: "1px solid var(--m-border)",
        // Matches the top card, so the pile reads as the same kind of object.
        borderRadius: "var(--m-radius-lg)",
        opacity: 1 - depth * 0.22,
        // Deeper cards paint behind shallower ones regardless of DOM order.
        zIndex: 10 - depth,
        transition:
          "inset-inline-start 260ms cubic-bezier(0.22, 1, 0.36, 1), transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {showPhoto ? (
        <ProductImage
          src={product.imageUrl}
          alt=""
          seed={product.id}
          rounded="0"
          className="size-full"
        />
      ) : (
        <div className="size-full" style={{ background: "var(--m-primary-soft)" }} />
      )}

      {/* Dimmed, so the sliver never competes with the dish in front of it. */}
      <div
        className="absolute inset-0"
        style={{ background: "var(--m-bg)", opacity: 0.35 + depth * 0.12 }}
      />
    </div>
  );
}

function VitrinCard({
  product,
  position,
  total,
  showPrices,
  showPhoto,
  canOrder,
  locale,
  minutesLabel,
  unavailableLabel,
  addLabel,
  inCart,
  onOpen,
  onAdd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTransitionEnd,
  dragging,
  dx,
  tilt,
}: {
  product: MenuProduct;
  position: number;
  total: number;
  showPrices: boolean;
  showPhoto: boolean;
  canOrder: boolean;
  locale: string;
  minutesLabel: string;
  unavailableLabel: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onTransitionEnd: (e: React.TransitionEvent) => void;
  dragging: boolean;
  dx: number;
  tilt: number;
}) {
  const num = (n: number) => formatNumber(n, locale === "fa" ? "fa" : "en");

  return (
    <article
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTransitionEnd={onTransitionEnd}
      /*
        `fade-in` on mount, not `scale-in`.
        The card is keyed by product, so each new dish mounts fresh and this
        runs once as it arrives. Deliberately an opacity-only animation: a CSS
        animation outranks an inline style for the properties it touches, so
        animating `transform` here would leave the card ignoring the drag for
        the length of the animation — the gesture would simply not track for a
        quarter of a second after every swipe.
      */
      className="absolute inset-x-0 top-0 flex h-full animate-[fade-in_0.25s_ease-out] flex-col overflow-hidden select-none"
      style={{
        // Above the peeking cards behind it.
        zIndex: 10,
        transform: `translateX(${dx}px) rotate(${tilt}deg)`,
        // No transition while the finger is down — the card must track the
        // thumb exactly, and a 200ms ease there feels like lag, not polish.
        transition: dragging
          ? "none"
          : `transform ${FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        background: "var(--m-surface)",
        border: "1px solid var(--m-border)",
        // The larger step of the theme's radius scale. A card this size needs a
        // visibly rounded corner to read as an object you could pick up and
        // throw; at the base radius it reads as a cropped region of the page.
        borderRadius: "var(--m-radius-lg)",
        // Hands the vertical axis back to the browser so the page still
        // scrolls under a thumb that started on the card.
        touchAction: "pan-y",
        cursor: dragging ? "grabbing" : "grab",
        boxShadow: "0 18px 50px -12px rgb(0 0 0 / 0.55)",
      }}
    >
      <div className="relative min-h-0 flex-1">
        {showPhoto ? (
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            seed={product.id}
            rounded="0"
            className="size-full"
          />
        ) : (
          <div className="size-full" style={{ background: "var(--m-primary-soft)" }} />
        )}

        {!product.isAvailable && <UnavailableOverlay label={unavailableLabel} />}

        {/*
          The scrim, not a solid panel.
          A dish photographed against a dark plate has no reliable light area to
          put white text on, so the text carries its own gradient down to a
          near-opaque floor. This is the difference between "readable on most
          photos" and "readable on every photo".
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background:
              "linear-gradient(to top, var(--m-surface) 8%, color-mix(in oklab, var(--m-surface) 82%, transparent) 42%, transparent 100%)",
          }}
        />

        {/*
          The position, set enormous.
          It is the one piece of pure navigation in a layout that otherwise
          shows nothing but the dish, and at this size it doubles as the
          template's signature — no other template in the catalogue has a
          three-figure numeral on it.
        */}
        <span
          aria-hidden
          className="absolute end-4 top-3 text-[64px] leading-none font-black tabular-nums"
          style={{ color: "var(--m-primary)", opacity: 0.22 }}
        >
          {num(position)}
        </span>

        {product.prepMinutes ? (
          <span
            className="absolute start-4 top-4 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: "var(--m-surface)",
              color: "var(--m-text)",
              borderRadius: "var(--m-radius-sm)",
            }}
          >
            <Clock className="size-3 shrink-0" />
            <bdi className="tabular-nums">{num(product.prepMinutes)}</bdi>
            {minutesLabel}
          </span>
        ) : null}
      </div>

      <div className="relative shrink-0 px-5 pt-1 pb-5">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-start focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: "var(--m-primary)" }}
        >
          <h2 className="text-2xl leading-tight font-black text-balance">
            {product.name}
            <DishTagIcons tags={product.dietaryTags} />
          </h2>
          {product.shortDescription && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-6 opacity-70">
              {product.shortDescription}
            </p>
          )}
        </button>

        <div className="mt-4 flex items-center justify-between gap-3">
          <PriceTag
            price={product.price}
            compareAt={product.compareAtPrice}
            show={showPrices}
            locale={locale}
            className="min-w-0 text-xl"
          />

          {canOrder && product.isAvailable && (
            <AddToCartButton
              inCart={inCart}
              onAdd={onAdd}
              label={`${addLabel} — ${product.name}`}
              locale={locale}
              className="size-12 shrink-0"
            />
          )}
        </div>
      </div>

      {/*
        The card's own position, for assistive technology only.
        The visible numeral is decorative and hidden from the tree; this is the
        sentence a screen reader actually reads when the card changes.
      */}
      <span className="sr-only" aria-live="polite">
        {num(position)} / {num(total)} — {product.name}
      </span>
    </article>
  );
}

/**
 * Buttons, counter and the first-run hint.
 *
 * The buttons are not a fallback for the gesture — they are the primary control
 * for every guest on a laptop, every keyboard user, and anyone who never
 * discovers that the card moves. They are sized and placed as if the swipe did
 * not exist.
 */
function DeckControls({
  position,
  total,
  locale,
  hinted,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: {
  position: number;
  total: number;
  locale: string;
  hinted: boolean;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const num = (n: number) => formatNumber(n, locale === "fa" ? "fa" : "en");

  if (total < 2) return null;

  return (
    <div className="mt-4 flex items-center justify-between gap-4 pb-6">
      <DeckArrow onClick={onPrevious} label={previousLabel} locale={locale} back />

      <div className="flex min-w-0 flex-col items-center gap-1.5">
        <p className="text-xs font-black tabular-nums" aria-hidden>
          <bdi>{num(position)}</bdi>
          <span className="mx-1 opacity-40">/</span>
          <bdi className="opacity-40">{num(total)}</bdi>
        </p>

        {/*
          The hint retires permanently after the first move in either direction.
          A prompt that keeps reappearing stops being help and becomes noise —
          and it occupies the space directly under the deck, which is where a
          thumb rests.
        */}
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-bold transition-opacity duration-300"
          style={{ opacity: hinted ? 0 : 0.55 }}
          aria-hidden={hinted}
        >
          <MoveHorizontal className="size-3.5" />
          {locale === "fa" ? "بکشید" : "Swipe"}
        </span>
      </div>

      <DeckArrow onClick={onNext} label={nextLabel} locale={locale} />
    </div>
  );
}

function DeckArrow({
  onClick,
  label,
  locale,
  back,
}: {
  onClick: () => void;
  label: string;
  locale: string;
  back?: boolean;
}) {
  // The glyph points at physical screen space, so it mirrors with the script:
  // "next" is leftwards in Persian and rightwards in English.
  const Icon = (locale === "fa") === Boolean(back) ? ChevronRight : ChevronLeft;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "tap-safe grid size-12 shrink-0 place-items-center",
        "transition-[transform,background-color] duration-150 active:scale-90",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
      style={{
        background: "var(--m-surface)",
        color: "var(--m-text)",
        border: "1px solid var(--m-border)",
        borderRadius: "var(--m-radius)",
        outlineColor: "var(--m-primary)",
      }}
    >
      <Icon className="size-5" />
    </button>
  );
}

/** Search results: a flat, scannable row. Deliberately not a card. */
function SearchRow({
  product,
  showPrices,
  canOrder,
  locale,
  addLabel,
  inCart,
  onOpen,
  onAdd,
}: {
  product: MenuProduct;
  showPrices: boolean;
  canOrder: boolean;
  locale: string;
  addLabel: string;
  inCart: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <li
      className="flex items-center gap-3 p-2.5"
      style={{
        background: "var(--m-surface)",
        border: "1px solid var(--m-border)",
        borderRadius: "var(--m-radius)",
        opacity: product.isAvailable ? 1 : 0.55,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ outlineColor: "var(--m-primary)" }}
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          seed={product.id}
          rounded="var(--m-radius-sm)"
          className="size-14 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold">
            {product.name}
            <DishTagIcons tags={product.dietaryTags} />
          </span>
          <PriceTag
            price={product.price}
            compareAt={product.compareAtPrice}
            show={showPrices}
            locale={locale}
            className="mt-0.5 text-sm"
          />
        </span>
      </button>

      {canOrder && product.isAvailable && (
        <AddToCartButton
          inCart={inCart}
          onAdd={onAdd}
          label={`${addLabel} — ${product.name}`}
          locale={locale}
          className="shrink-0"
        />
      )}
    </li>
  );
}
