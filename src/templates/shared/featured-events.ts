"use client";

import { recommendationSessionKey } from "./recommendation-events";

/**
 * Reporting what a guest did with a featured dish.
 *
 * The same contract as `recommendation-events.ts`, and deliberately sharing its
 * session key: the two surfaces measure the same guest, and issuing a second id
 * would make "one guest, two surfaces" look like two guests on any question
 * that ever spans both.
 *
 * Fire-and-forget with errors swallowed, because this is telemetry on the hot
 * path of a public menu and a guest's dinner does not depend on it arriving.
 * Accuracy comes from the unique index on the table, not from here.
 */

export type FeaturedEventType = "IMPRESSION" | "VIEW" | "ADD_TO_CART";

/**
 * Pairs already reported this page load. The server would reject a duplicate
 * anyway; this saves the round trip.
 */
const sent = new Set<string>();

export function reportFeaturedEvent(input: {
  slug: string;
  productId: string;
  type: FeaturedEventType;
  /** True in the dashboard previewer, where nothing should be recorded. */
  preview?: boolean;
}): void {
  if (input.preview) return;
  if (typeof window === "undefined") return;

  const key = `${input.type}:${input.productId}`;
  if (sent.has(key)) return;
  sent.add(key);

  const body = JSON.stringify({
    slug: input.slug,
    productId: input.productId,
    type: input.type,
    sessionKey: recommendationSessionKey(),
  });

  // `keepalive` so an ADD_TO_CART survives the navigation it may trigger.
  void fetch("/api/public/featured-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Allow a retry on a later interaction rather than holding the key.
    sent.delete(key);
  });
}
