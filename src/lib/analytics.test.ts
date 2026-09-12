import { describe, expect, it } from "vitest";
import { dayKey, netRevenue, rangeLengthInDays, startOfDay } from "./analytics";
import { startOfDayInZone, zonedParts } from "./time";

/**
 * The reporting layer's day boundaries must not depend on how the process was
 * started.
 *
 * `startOfDay` has been zone-anchored since the timezone pass, but the bucket
 * *key* orders were filed under was still built from `getFullYear/Month/Date`,
 * which read the host clock. On the Tehran dev box the two agree and everything
 * looks correct; on a UTC VPS — the documented deployment target — they drift
 * 3½ hours apart, so the range is measured in one calendar and the buckets in
 * another.
 *
 * These run correctly under any host zone. Under `TZ=UTC` they fail against the
 * host-clock implementation, which is the whole point of having them.
 */
describe("dayKey", () => {
  it("files an instant under the venue's calendar day", () => {
    // 00:30 Tehran on 21 March — still 20 March in UTC.
    expect(dayKey(new Date("2026-03-20T21:00:00Z"))).toBe("2026-03-21");
    // Exactly midnight Tehran on 9 September.
    expect(dayKey(new Date("2026-09-08T20:30:00Z"))).toBe("2026-09-09");
    // Late evening Tehran, comfortably inside the same day.
    expect(dayKey(new Date("2026-09-09T19:00:00Z"))).toBe("2026-09-09");
  });

  /**
   * The invariant the daily series depends on: the key for a day's opening
   * instant has to be the key every order inside that day gets. When it is not,
   * the seeded buckets and the orders land in different rows and a day's takings
   * silently vanish from the chart.
   */
  it("gives a day's start the same key as an order inside that day", () => {
    for (const iso of [
      "2026-09-09T19:00:00Z",
      "2026-03-20T21:00:00Z",
      "2026-01-01T03:00:00Z",
      "2026-06-15T23:59:00Z",
    ]) {
      const instant = new Date(iso);
      expect(dayKey(startOfDay(instant)), iso).toBe(dayKey(instant));
    }
  });

  it("agrees with the zone reader for a sweep across a week", () => {
    for (let hours = 0; hours < 24 * 7; hours += 3) {
      const instant = new Date(Date.UTC(2026, 8, 1) + hours * 3_600_000);
      const p = zonedParts(instant);
      const expected = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;

      expect(dayKey(instant), instant.toISOString()).toBe(expected);
    }
  });

  /** Stepping the seeder forward must land on consecutive venue days. */
  it("advances one calendar day at a time when the range is walked", () => {
    const from = startOfDayInZone(new Date("2026-09-09T12:00:00Z"), -3);
    const keys = [0, 1, 2, 3].map((i) => dayKey(startOfDayInZone(from, i)));

    expect(new Set(keys).size).toBe(4);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("netRevenue", () => {
  /** The platform's one definition: what the venue earned, not what was paid. */
  it("removes tax and tip from the collected total", () => {
    expect(netRevenue({ total: 120_000, tax: 9_000, tip: 11_000 })).toBe(100_000);
  });

  it("is unchanged for orders that carry neither", () => {
    expect(netRevenue({ total: 100_000, tax: 0, tip: 0 })).toBe(100_000);
  });
});

describe("rangeLengthInDays", () => {
  it("counts both ends of a whole-day range", () => {
    const from = startOfDayInZone(new Date("2026-09-09T12:00:00Z"), -6);
    const to = new Date(
      startOfDayInZone(new Date("2026-09-09T12:00:00Z"), 1).getTime() - 1,
    );

    expect(rangeLengthInDays({ from, to })).toBe(7);
  });

  it("never reports less than a day", () => {
    const at = new Date("2026-09-09T12:00:00Z");
    expect(rangeLengthInDays({ from: at, to: at })).toBe(1);
  });
});
