import { describe, expect, it } from "vitest";
import {
  COMPARISON_PRESETS,
  resolveComparison,
  startOfWeekInZone,
  type ComparisonPreset,
} from "./insight-periods";
import { startOfDayInZone, zonedMoment, zonedParts } from "./time";
import { toJalaliInZone } from "./jalali";

/** Mid-afternoon Tehran on a fixed date, so no offset lands near midnight. */
const NOW = new Date("2026-09-09T12:00:00Z");
const DAY = 86_400_000;

const span = (r: { from: Date; to: Date }) => r.to.getTime() - r.from.getTime();

describe("resolveComparison — shared invariants", () => {
  it("resolves every preset", () => {
    for (const preset of COMPARISON_PRESETS) {
      expect(resolveComparison(preset, NOW), preset).toBeDefined();
    }
  });

  it("is deterministic for the same instant", () => {
    for (const preset of COMPARISON_PRESETS) {
      expect(resolveComparison(preset, NOW), preset).toEqual(
        resolveComparison(preset, NOW),
      );
    }
  });

  /** A comparison whose windows overlap would count the same order twice. */
  it("never lets the previous window reach into the current one", () => {
    for (const preset of COMPARISON_PRESETS) {
      const { current, previous } = resolveComparison(preset, NOW);
      expect(previous.to.getTime(), preset).toBeLessThan(current.from.getTime());
    }
  });

  /**
   * The heart of an honest comparison: the two windows must cover the same
   * amount of trading time. Comparing a part-finished period against a whole
   * one reports a collapse every morning.
   */
  it("gives both windows the same duration", () => {
    for (const preset of COMPARISON_PRESETS) {
      // Within a second, since day boundaries end at 23:59:59.999.
      expect(
        Math.abs(
          span(resolveComparison(preset, NOW).current) -
            span(resolveComparison(preset, NOW).previous),
        ),
        preset,
      ).toBeLessThan(1000);
    }
  });

  it("always reports a positive day count", () => {
    for (const preset of COMPARISON_PRESETS) {
      expect(resolveComparison(preset, NOW).days, preset).toBeGreaterThan(0);
    }
  });
});

describe("resolveComparison — today", () => {
  const result = resolveComparison("today", NOW);

  it("runs from the venue's midnight to now", () => {
    expect(result.current.from).toEqual(startOfDayInZone(NOW));
    expect(result.current.to).toEqual(NOW);
  });

  /**
   * Against the same weekday last week rather than yesterday. Restaurant trade
   * is weekly — Thursday is busy and Monday is not — so weekday-to-weekday is
   * the only version of this an owner can act on. Same rule as the overview's
   * existing today comparison.
   */
  it("compares against the same slice of the same weekday last week", () => {
    expect(result.previous.from.getTime()).toBe(result.current.from.getTime() - 7 * DAY);
    expect(result.previous.to.getTime()).toBe(result.current.to.getTime() - 7 * DAY);
  });

  it("is marked incomplete", () => {
    expect(result.incomplete).toBe(true);
  });
});

describe("resolveComparison — yesterday", () => {
  const result = resolveComparison("yesterday", NOW);

  it("covers one whole finished day", () => {
    expect(result.current.from).toEqual(startOfDayInZone(NOW, -1));
    expect(span(result.current)).toBeGreaterThan(DAY - 1000);
    expect(span(result.current)).toBeLessThan(DAY);
  });

  it("compares against the same weekday the week before", () => {
    expect(result.previous.from.getTime()).toBe(result.current.from.getTime() - 7 * DAY);
  });

  it("is complete", () => {
    expect(result.incomplete).toBe(false);
  });
});

describe("resolveComparison — rolling windows", () => {
  const cases: [ComparisonPreset, number][] = [
    ["last7", 7],
    ["last30", 30],
    ["last90", 90],
  ];

  /**
   * Today is deliberately excluded. A rolling window ending "now" holds a
   * part-traded day, and comparing it against a whole one shows every venue
   * losing money before lunch.
   */
  it.each(cases)("%s ends yesterday, not today", (preset) => {
    const { current } = resolveComparison(preset, NOW);
    expect(current.to.getTime()).toBeLessThan(startOfDayInZone(NOW).getTime());
  });

  it.each(cases)("%s spans exactly its day count", (preset, days) => {
    const { current, previous, days: reported } = resolveComparison(preset, NOW);

    expect(reported).toBe(days);
    expect(current.from).toEqual(startOfDayInZone(NOW, -days));
    expect(previous.from).toEqual(startOfDayInZone(NOW, -(days * 2)));
  });

  it.each(cases)("%s is a complete-against-complete comparison", (preset) => {
    expect(resolveComparison(preset, NOW).incomplete).toBe(false);
  });
});

describe("startOfWeekInZone", () => {
  /** The Iranian week begins on Saturday. */
  it("lands on a Saturday", () => {
    for (let offset = 0; offset < 14; offset++) {
      const day = new Date(NOW.getTime() + offset * DAY);
      const start = startOfWeekInZone(day);
      expect(zonedMoment(start).dayOfWeek, day.toISOString()).toBe(6);
    }
  });

  it("starts at the venue's midnight", () => {
    const start = startOfWeekInZone(NOW);
    expect(zonedParts(start).hour).toBe(0);
    expect(zonedParts(start).minute).toBe(0);
  });

  it("never returns an instant after the day it is asked about", () => {
    for (let offset = 0; offset < 14; offset++) {
      const day = new Date(NOW.getTime() + offset * DAY);
      expect(startOfWeekInZone(day).getTime()).toBeLessThanOrEqual(day.getTime());
    }
  });

  it("is stable across a whole week", () => {
    const saturday = startOfWeekInZone(NOW);
    for (let offset = 0; offset < 7; offset++) {
      const within = new Date(saturday.getTime() + offset * DAY + 3600_000);
      expect(startOfWeekInZone(within).getTime(), `day ${offset}`).toBe(
        saturday.getTime(),
      );
    }
  });
});

describe("resolveComparison — thisWeek", () => {
  const result = resolveComparison("thisWeek", NOW);

  it("runs from Saturday to now", () => {
    expect(result.current.from).toEqual(startOfWeekInZone(NOW));
    expect(result.current.to).toEqual(NOW);
  });

  it("compares against the same elapsed slice of last week", () => {
    expect(result.previous.from.getTime()).toBe(result.current.from.getTime() - 7 * DAY);
    expect(result.previous.to.getTime()).toBe(result.current.to.getTime() - 7 * DAY);
  });

  it("is marked incomplete", () => {
    expect(result.incomplete).toBe(true);
  });
});

describe("resolveComparison — thisMonth", () => {
  const result = resolveComparison("thisMonth", NOW);

  /** Jalali, not Gregorian: an Iranian owner's month is Shahrivar, not September. */
  it("starts on the first day of the Jalali month", () => {
    expect(toJalaliInZone(result.current.from).jd).toBe(1);
  });

  it("runs to now", () => {
    expect(result.current.to).toEqual(NOW);
  });

  it("compares against the same elapsed slice of the previous Jalali month", () => {
    expect(toJalaliInZone(result.previous.from).jd).toBe(1);

    const currentMonth = toJalaliInZone(result.current.from);
    const previousMonth = toJalaliInZone(result.previous.from);
    const monthsApart =
      (currentMonth.jy - previousMonth.jy) * 12 + (currentMonth.jm - previousMonth.jm);
    expect(monthsApart).toBe(1);
  });

  /** A shorter previous month must not have its window spill into this one. */
  it("never lets the previous slice run past its own month", () => {
    for (let day = 0; day < 32; day++) {
      const at = new Date(NOW.getTime() + day * DAY);
      const { current, previous } = resolveComparison("thisMonth", at);
      expect(previous.to.getTime(), at.toISOString()).toBeLessThan(
        current.from.getTime(),
      );
    }
  });

  it("is marked incomplete", () => {
    expect(result.incomplete).toBe(true);
  });
});
