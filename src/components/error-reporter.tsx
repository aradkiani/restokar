"use client";

import * as React from "react";

/** At most this many reports per page load: a loop must not become a flood. */
const MAX_REPORTS = 5;
let sent = 0;
const seen = new Set<string>();

/** Noise every site sees that says nothing about this one. */
function isNoise(message: string, stack: string | undefined): boolean {
  return (
    /ResizeObserver loop|Script error\.?$|Load failed|NetworkError|Failed to fetch/i.test(
      message,
    ) || /(chrome|moz|safari)-extension:\/\//.test(stack ?? "")
  );
}

/**
 * Sends an error from this browser to the platform's error log.
 *
 * Fire and forget, with `keepalive` so a report survives the page unloading,
 * and deduplicated per page so one broken render is one report.
 */
export function reportClientError(error: unknown, digest?: string): void {
  if (typeof window === "undefined" || sent >= MAX_REPORTS) return;
  const err = error as { message?: unknown; stack?: unknown };
  const message = typeof err?.message === "string" ? err.message : String(error);
  const stack = typeof err?.stack === "string" ? err.stack : undefined;
  if (!message || isNoise(message, stack)) return;
  const key = `${message}|${window.location.pathname}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, 1_000),
      stack: stack?.slice(0, 8_000),
      path: window.location.pathname,
      digest,
    }),
    keepalive: true,
  }).catch(() => {});
}

/** Listens for uncaught errors and rejected promises anywhere on the page. */
export function ErrorReporter() {
  React.useEffect(() => {
    const onError = (event: ErrorEvent) =>
      reportClientError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
