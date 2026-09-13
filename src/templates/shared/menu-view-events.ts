"use client";

/**
 * Telling the server a guest opened this menu.
 *
 * Reported from the browser because the menu page is served with
 * `revalidate = 60`: a cached render runs no server code, so counting there
 * would record about one view a minute no matter how many people scanned the
 * code at the table.
 *
 * The same shape as `featured-events.ts` and `recommendation-events.ts` beside
 * it — fire and forget, errors swallowed, nothing about the guest in the body.
 * A menu open is not worth delaying a page for, and a failed beacon costs one
 * missed count rather than a broken dinner.
 */

/**
 * One report per page load.
 *
 * Guarded here as well as by the rate limit, because React may mount a
 * component twice in development's strict mode and a guest who opens the cart
 * and closes it again has not opened the menu a second time. A genuine second
 * visit is a new document and a new module instance.
 */
let reported = false;

export function reportMenuView(input: { slug: string; preview?: boolean }): void {
  // The dashboard previewer renders the same templates against real data. A
  // venue checking its own design must not inflate its own figures.
  if (input.preview) return;
  if (typeof window === "undefined") return;
  if (reported) return;

  reported = true;

  const body = JSON.stringify({ slug: input.slug });

  /*
    `keepalive` so the report survives the guest navigating away in the same
    breath — tapping a dish, or closing the tab. Without it a fast reader's
    visit is the one that does not get counted.
  */
  void fetch("/api/public/menu-view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* telemetry: never surfaced, never retried */
  });
}
