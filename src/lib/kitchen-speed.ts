/**
 * How fast the kitchen turns an order round: placed → ready.
 *
 * Two consumers. The order board colours a card as it waits, so the pass sees
 * a late ticket before the guest complains; the analytics page reports what
 * "usually" and "on a bad day" look like, and at which hours it slips.
 *
 * Free of database and framework imports, like every domain module here.
 */

import { ORDER_URGENT_MINUTES } from "./constants";

/**
 * When a waiting card turns amber. Well before it turns red, so there is time
 * to do something about it.
 */
export const ORDER_WARN_MINUTES = 12;

/**
 * Longer than this is not cooking time, it is bookkeeping.
 *
 * Venues that only tidy the board at closing mark a lunch order "ready" six
 * hours after it was placed. Counting those would turn a 15-minute kitchen
 * into a 2-day one on paper, so they are left out of the speed figures and
 * reported as a count instead, which is itself worth knowing.
 */
export const PREP_OUTLIER_MINUTES = 180;

export type WaitLevel = "ok" | "warn" | "late";

/** How worried the pass should be about an order that has waited this long. */
export function waitLevel(minutes: number): WaitLevel {
  if (minutes >= ORDER_URGENT_MINUTES) return "late";
  if (minutes >= ORDER_WARN_MINUTES) return "warn";
  return "ok";
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/**
 * Nearest-rank percentile of an ascending list.
 *
 * Nearest-rank rather than interpolated because the answer is read as "nine in
 * ten orders were ready within N minutes", which is only true of a value that
 * actually occurred.
 */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export interface PrepSample {
  placedAt: Date;
  readyAt: Date;
  serviceType: "DINE_IN" | "TAKEAWAY";
  /** The venue's wall-clock hour the order was placed in, 0–23. */
  hour: number;
}

export interface KitchenSpeed {
  /** Orders the figures are built from. */
  measured: number;
  /** Orders left out as bookkeeping rather than cooking. */
  skipped: number;
  median: number | null;
  average: number | null;
  p90: number | null;
  /** Share of measured orders ready within the urgent threshold, 0–1. */
  withinTarget: number | null;
  /** Median per placing hour, only hours with orders. */
  byHour: { hour: number; median: number; count: number }[];
  byService: Record<"DINE_IN" | "TAKEAWAY", { median: number | null; count: number }>;
}

function median(sorted: readonly number[]): number | null {
  return percentile(sorted, 50);
}

export function summariseKitchenSpeed(
  samples: readonly PrepSample[],
  targetMinutes = ORDER_URGENT_MINUTES,
): KitchenSpeed {
  const kept: (PrepSample & { minutes: number })[] = [];
  let skipped = 0;
  for (const sample of samples) {
    const minutes = minutesBetween(sample.placedAt, sample.readyAt);
    if (minutes > PREP_OUTLIER_MINUTES) skipped += 1;
    else kept.push({ ...sample, minutes });
  }

  const all = kept.map((s) => s.minutes).sort((a, b) => a - b);
  const total = all.reduce((sum, m) => sum + m, 0);

  const hours = new Map<number, number[]>();
  const services: Record<"DINE_IN" | "TAKEAWAY", number[]> = {
    DINE_IN: [],
    TAKEAWAY: [],
  };
  for (const sample of kept) {
    const list = hours.get(sample.hour) ?? [];
    list.push(sample.minutes);
    hours.set(sample.hour, list);
    services[sample.serviceType].push(sample.minutes);
  }

  const byHour = [...hours.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, list]) => {
      const sorted = list.sort((a, b) => a - b);
      return { hour, median: median(sorted)!, count: sorted.length };
    });

  const serviceStats = (list: number[]) => {
    const sorted = list.sort((a, b) => a - b);
    return { median: median(sorted), count: sorted.length };
  };

  return {
    measured: all.length,
    skipped,
    median: median(all),
    average: all.length ? Math.round(total / all.length) : null,
    p90: percentile(all, 90),
    withinTarget: all.length
      ? all.filter((m) => m <= targetMinutes).length / all.length
      : null,
    byHour,
    byService: {
      DINE_IN: serviceStats(services.DINE_IN),
      TAKEAWAY: serviceStats(services.TAKEAWAY),
    },
  };
}
