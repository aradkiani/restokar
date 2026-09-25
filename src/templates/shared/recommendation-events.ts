"use client";

/**
 * Reporting what a guest did with a suggestion.
 *
 * Deliberately small and deliberately unreliable-tolerant: this is telemetry on
 * the hot path of a public menu, so nothing here may delay an interaction, and
 * a failed report must never surface to a guest ordering dinner. Every send is
 * fire-and-forget with errors swallowed.
 *
 * Accuracy comes from the database, not from here. The unique index on
 * `RecommendationEvent` collapses repeats for one session, so the honest thing
 * for this module to do is send whenever it plausibly should and let the
 * constraint decide what actually happened. The in-memory guard below is only
 * an optimisation — it saves requests, it is not what makes the count correct.
 */

export type RecommendationEventType = "IMPRESSION" | "INTERACTION" | "ADD_TO_CART";

const SESSION_STORAGE_KEY = "restokar:rec-session";

/**
 * A random id identifying this browser's ordering session.
 *
 * Not a person and not a login: it exists so the server can tell "shown to one
 * guest four times" from "shown to four guests", which is the whole difference
 * between an impression count that means something and one that counts
 * refreshes.
 *
 * Kept in `localStorage` beside the cart so it survives the reload that a
 * refresh-inflated metric would otherwise be counting. Falls back to a
 * per-page-load value when storage is unavailable (private mode), which
 * degrades the deduplication rather than breaking the menu.
 */
let cachedSessionKey: string | null = null;

export function recommendationSessionKey(): string {
  if (cachedSessionKey) return cachedSessionKey;

  const generated = randomKey();

  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored && stored.length >= 8) {
      cachedSessionKey = stored;
      return stored;
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  } catch {
    // Private mode or a full quota. The generated key still works for this
    // page load; only cross-reload deduplication is lost.
  }

  cachedSessionKey = generated;
  return generated;
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pairs already reported this page load, so a React re-render or a remount does
 * not re-send. The server would reject the duplicate anyway; this saves the
 * round trip.
 */
const sent = new Set<string>();

export function reportRecommendationEvent(input: {
  slug: string;
  sourceProductId: string;
  recommendedProductId: string;
  type: RecommendationEventType;
  /** True in the dashboard previewer, where nothing should be recorded. */
  preview?: boolean;
}): void {
  if (input.preview) return;
  if (typeof window === "undefined") return;

  const key = `${input.type}:${input.sourceProductId}:${input.recommendedProductId}`;
  if (sent.has(key)) return;
  sent.add(key);

  const body = JSON.stringify({
    slug: input.slug,
    sourceProductId: input.sourceProductId,
    recommendedProductId: input.recommendedProductId,
    type: input.type,
    sessionKey: recommendationSessionKey(),
  });

  /*
    `keepalive` so a report survives the navigation it may have triggered —
    an ADD_TO_CART immediately followed by the guest moving on would otherwise
    be cancelled in flight.
  */
  void fetch("/api/public/recommendation-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // A guest's dinner does not depend on telemetry arriving. Allow a retry on
    // a later interaction rather than holding the key.
    sent.delete(key);
  });
}
