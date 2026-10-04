"use client";

import * as React from "react";

/**
 * The wall clock, refreshed every `intervalMs`, safe for server rendering.
 *
 * Returns 0 during the server render and hydration, so both sides agree, then
 * the real time; React re-renders with it straight after hydration. Every
 * component asking for the same interval shares one timer and one reading, so
 * two cards on a board never disagree about what time it is.
 *
 * Callers treat 0 as "not known yet" — e.g. not filtering anything out by age.
 */
export function useNow(intervalMs: number): number {
  const clock = clockFor(intervalMs);
  return React.useSyncExternalStore(clock.subscribe, clock.read, readServer);
}

const readServer = () => 0;

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  /**
   * Created once per interval and reused. React re-subscribes whenever this
   * function's identity changes, so a fresh arrow on every render would mean
   * an unsubscribe and resubscribe each time — which, with the staleness
   * refresh below, fed a render loop.
   */
  subscribe: (onChange: () => void) => () => void;
  read: () => number;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  const existing = clocks.get(intervalMs);
  if (existing) return existing;

  const clock: Clock = {
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    // A stable value between ticks: React calls this on every render and
    // requires the same answer until something changes.
    read: () => clock.now,
    subscribe: (onChange) => {
      clock.listeners.add(onChange);
      if (clock.timer === null) {
        // Only a genuinely stale reading (the board was closed for a while) is
        // refreshed on subscribe; a fresh one is left alone so subscribing
        // never changes the snapshot by itself.
        if (Date.now() - clock.now >= intervalMs) clock.now = Date.now();
        clock.timer = setInterval(() => {
          clock.now = Date.now();
          for (const listener of clock.listeners) listener();
        }, intervalMs);
      }
      return () => {
        clock.listeners.delete(onChange);
        if (clock.listeners.size === 0 && clock.timer !== null) {
          clearInterval(clock.timer);
          clock.timer = null;
        }
      };
    },
  };
  clocks.set(intervalMs, clock);
  return clock;
}
