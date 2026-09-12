/**
 * Cross-cutting constants.
 *
 * Values that more than one module depends on, or that an operator may want to
 * change without reading route handlers, live here. Anything genuinely local to
 * one module stays in that module — a constants file that collects every
 * literal in the codebase is just indirection.
 *
 * Secrets and per-deployment configuration belong in src/lib/env.ts, not here.
 */

// ------------------------------- durations ---------------------------------

/** One day in milliseconds. Repeated inline in four modules before this. */
export const DAY_MS = 86_400_000;

export const MINUTE_MS = 60_000;

// ------------------------------ auth / session -----------------------------

/** How long a session cookie stays valid. */
export const SESSION_DAYS = 30;

/**
 * bcrypt cost factor. 12 is roughly 250ms on commodity hardware: slow enough
 * that offline cracking is expensive, fast enough for an interactive login.
 * Raising this is safe — existing hashes record their own cost and still verify.
 */
export const BCRYPT_ROUNDS = 12;

// ------------------------------ subscriptions ------------------------------

/** Free trial length granted at registration. */
export const TRIAL_DAYS = 14;

/**
 * Days a menu keeps serving after the subscription lapses. A restaurant with
 * printed QR codes on its tables should not go dark the moment a card expires.
 */
export const GRACE_DAYS = 3;

/** Warn the owner in the dashboard when the period ends within this window. */
export const RENEWAL_WARNING_DAYS = 5;

/**
 * How far ahead the admin console looks for "expiring soon".
 *
 * Wider than RENEWAL_WARNING_DAYS on purpose: the owner's own warning should
 * fire close to the date, while platform staff need enough lead time to reach
 * out before a renewal lapses.
 */
export const EXPIRY_WARNING_DAYS = 14;

/** Bounds on a single manual subscription extension, in days. */
export const MIN_EXTENSION_DAYS = 1;
export const MAX_EXTENSION_DAYS = 365;

/**
 * Bounds on the subscription an admin grants when creating an account by hand.
 *
 * Wider at the top than a single extension because this is the *initial* term —
 * onboarding a customer who has paid for two years offline is a normal case,
 * whereas a two-year ad-hoc extension is usually a typo.
 */
export const MIN_ONBOARDING_DAYS = 1;
export const MAX_ONBOARDING_DAYS = 730;

// ------------------------------- rate limits -------------------------------

/**
 * Per-action request ceilings, previously inline at each call site where they
 * could not be compared against one another.
 *
 * `limit` is requests allowed per `windowSeconds`. Login is counted per IP and
 * per account: the account bucket resists password guessing against one user,
 * the IP bucket resists spraying across many.
 */
export const RATE_LIMITS = {
  loginPerIp: { limit: 10, windowSeconds: 300 },
  loginPerAccount: { limit: 8, windowSeconds: 900 },
  register: { limit: 5, windowSeconds: 900 },
  /** Generous: a real table of guests legitimately orders several times. */
  placeOrder: { limit: 12, windowSeconds: 60 },
  upload: { limit: 60, windowSeconds: 300 },
  /** Tight: a table needs the waiter occasionally, not repeatedly. */
  staffCall: { limit: 4, windowSeconds: 300 },
  /**
   * Counted per user, not per address: this endpoint verifies the *current*
   * password, so it is a guessing oracle for whoever holds the session.
   * A genuine change is one or two attempts; a reset clears the count.
   */
  passwordChange: { limit: 6, windowSeconds: 900 },
  /**
   * Gateway return URL. Public by necessity — the payer's browser loads it —
   * and it looks a transaction up by Authority, so it is worth a ceiling even
   * though the identifier is long and gateway-issued.
   */
  paymentCallback: { limit: 30, windowSeconds: 300 },
  /**
   * Suggestion telemetry from the public menu.
   *
   * Roomier than the others because one guest legitimately produces several in
   * a sitting — an impression for each dish offered, then a tap, then an add —
   * and a table of four shares an address. The unique index already makes
   * repeats harmless, so this exists to bound abuse rather than to shape normal
   * traffic.
   */
  recommendationEvent: { limit: 60, windowSeconds: 300 },
} as const;

/** A staff call stays on the dashboard this long before it is treated as stale. */
export const STAFF_CALL_VISIBLE_MINUTES = 30;
export const STAFF_CALL_VISIBLE_MS = STAFF_CALL_VISIBLE_MINUTES * 60_000;

export function staffCallVisibleSince(): Date {
  return new Date(Date.now() - STAFF_CALL_VISIBLE_MS);
}

// --------------------------------- caching ---------------------------------
//
// ISR windows are NOT centralised here. Next.js statically analyses route
// segment config, so `export const revalidate` must be a literal in the route
// file — an imported constant fails the build with "Invalid segment
// configuration export". The values live at their call sites with a comment:
//   /menu/[slug]  → 60s   (a price change should reach guests quickly)
//   /  and /pricing → 300s (marketing copy changes rarely)

// --------------------------------- limits ----------------------------------

/**
 * Largest value a Postgres `integer` column holds.
 *
 * Every money column in the schema is `Int` (whole Toman), so a computed total
 * above this is not a big number — it is a failed INSERT and a 500. Amounts
 * that are *derived* rather than submitted have to be checked against it before
 * they are written, because no input schema bounds them: a basket of 50 lines
 * at 99 each multiplies well past the ceiling using individually valid prices.
 */
export const MAX_INT4 = 2_147_483_647;

// ------------------------------ menu / uploads -----------------------------

/** Information blocks an owner may define per product (ingredients, etc.). */
export const MAX_PRODUCT_INFO_SECTIONS = 3;

/**
 * Upload ceiling in bytes, enforced server-side. Keep Nginx's
 * `client_max_body_size` at or above this (see DEPLOY.md).
 *
 * The accepted MIME types are deliberately NOT here: the upload route pairs
 * each type with its magic-byte signature, and splitting that pair invites a
 * type being allowed without a corresponding content check.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Longest edge an uploaded image is reduced to, in pixels.
 *
 * A menu photo is displayed in a card a few hundred pixels wide, and at most
 * full-screen on a phone in the Vitrin template. 1600px covers that at 2× on
 * every device this runs on, with room to spare for the product sheet. Anything
 * beyond it is bytes the guest downloads and never sees.
 *
 * The browser downscales to this before uploading; the server independently
 * refuses anything above MAX_IMAGE_EDGE_HARD, because a client-side limit is a
 * courtesy, not a control.
 */
export const MAX_IMAGE_EDGE = 1600;

/**
 * The server's ceiling, deliberately looser than the client's target.
 *
 * A hand-made request that skips the browser entirely should still be refused,
 * but the gap absorbs a device whose canvas rounds differently rather than
 * rejecting a legitimate upload for being 1601px wide.
 */
export const MAX_IMAGE_EDGE_HARD = 4096;

/**
 * Total pixels the server will accept, independent of either edge.
 *
 * This is the decompression-bomb guard: a 20000×20000 PNG of one flat colour
 * compresses to a few kilobytes, passes any byte limit, and then asks for
 * ~1.6GB of memory from whatever decodes it. Neither edge alone catches a shape
 * like that, so the product is checked too.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

/**
 * Re-encode quality, 0–1.
 *
 * 0.86 is the point where WebP stops being distinguishable from the source on
 * photographs at normal viewing sizes while still saving most of the bytes.
 * Raising it buys nothing anyone can see; lowering it starts showing on
 * gradients — a plate under warm restaurant lighting is exactly the content
 * that bands first.
 */
export const IMAGE_QUALITY = 0.86;

// ------------------------------ kitchen board ------------------------------

/** An order older than this is flagged as running late. */
export const ORDER_URGENT_MINUTES = 20;

/** Fallback poll interval when the live event stream drops. */
export const ORDER_POLL_MS = 30_000;

/**
 * How long a delivered order stays on the board after it is handed over.
 *
 * Measured from `deliveredAt`, not from the start of the day: an order
 * delivered at 00:05 used to vanish at once because the previous rule kept
 * only orders *placed* since midnight. The row itself is never removed — this
 * only controls what the board still shows.
 */
export const DELIVERED_VISIBLE_MINUTES = 90;
export const DELIVERED_VISIBLE_MS = DELIVERED_VISIBLE_MINUTES * 60_000;

/**
 * The cutoff a delivered order must fall after to still appear on the board.
 *
 * A function rather than an inline `Date.now()` in the page: reading the clock
 * during a component's render is exactly what `react-hooks/purity` forbids, and
 * every other time window in this codebase (`resolveRange`, `startOfDay`) is
 * derived the same way.
 */
export function deliveredVisibleSince(): Date {
  return new Date(Date.now() - DELIVERED_VISIBLE_MS);
}

// -------------------------------- refunds ----------------------------------

/**
 * How long a refund stays on the board before the owner may clear it.
 *
 * A cancelled order the customer already paid for is money the venue is
 * holding and does not own. Clearing it is a claim that the money went back,
 * and the delay exists so that claim cannot be made in the same reflex as the
 * cancellation — the owner has to return to it deliberately, by which time a
 * gateway refund has actually had time to be issued.
 *
 * Enforced on the server, not just by hiding the button.
 */
export const REFUND_CLEAR_AFTER_MINUTES = 60;
export const REFUND_CLEAR_AFTER_MS = REFUND_CLEAR_AFTER_MINUTES * 60_000;

/**
 * Whether a cancelled order still owes the customer their money back.
 *
 * Deliberately not restricted to online payments. Cash taken at the table for
 * an order the kitchen then cancelled is the same debt — the only difference is
 * which drawer it comes out of, and an owner who never sees it on the board is
 * equally likely to forget it.
 */
export function needsRefund(order: {
  status: string;
  paymentStatus: string;
  refundedAt: Date | string | null;
}): boolean {
  return (
    order.status === "CANCELED" &&
    order.paymentStatus === "PAID" &&
    order.refundedAt === null
  );
}

// -------------------------------- contact ----------------------------------

/**
 * Placeholder contact details for the marketing site. Replace before launch —
 * these are referenced from the landing page footer and contact section.
 */
export const CONTACT = {
  phone: "021-00000000",
  phoneHref: "tel:+982100000000",
  email: "hello@menuland.ir",
} as const;
