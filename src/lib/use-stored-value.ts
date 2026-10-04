"use client";

import * as React from "react";

/**
 * Reads one value saved in this browser's localStorage, safely for a page the
 * server renders first.
 *
 * The server (and the first client render, during hydration) sees `null`;
 * React then re-renders with what the browser has stored. That is
 * `useSyncExternalStore`'s server-snapshot mechanism, which exists for exactly
 * this, so no effect has to copy the value into state after mount.
 *
 * Writes made in this tab do not notify — callers keep their own state for
 * what the user changes and fall back to this value until they do. Other tabs
 * do notify, through the `storage` event.
 *
 * Storage that is unavailable (private mode, disabled site data) reads as
 * `null` rather than throwing.
 */
export function useStoredValue(key: string | null): string | null {
  return React.useSyncExternalStore(
    subscribeToStorage,
    () => readStorage(key),
    () => null,
  );
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStorage(key: string | null): string | null {
  if (key === null) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Saves a value; failures (quota, private mode) are silently ignored. */
export function writeStoredValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* non-fatal */
  }
}
