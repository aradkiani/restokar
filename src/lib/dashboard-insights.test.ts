import { describe, expect, it } from "vitest";
import { percentDelta } from "./dashboard-insights";

/**
 * The dashboard prints this number next to today's takings, so the edge cases
 * matter more than the arithmetic: a venue's first Tuesday, or a quiet hour
 * with no baseline, must not render "+∞%" or "NaN%" beside real money.
 */

describe("percentDelta", () => {
  it("reports ordinary growth and decline", () => {
    expect(percentDelta(120, 100)).toBe(20);
    expect(percentDelta(80, 100)).toBe(-20);
    expect(percentDelta(100, 100)).toBe(0);
  });

  it("rounds to a whole percent", () => {
    expect(percentDelta(101, 99)).toBe(2);
    expect(percentDelta(1_234_567, 1_000_000)).toBe(23);
  });

  it("returns null when there is no baseline to compare against", () => {
    // The caller renders nothing at all for this, rather than "+∞%".
    expect(percentDelta(500_000, 0)).toBeNull();
  });

  it("treats nothing-to-nothing as flat rather than unknown", () => {
    expect(percentDelta(0, 0)).toBe(0);
  });

  it("reports a total collapse as −100%, not null", () => {
    expect(percentDelta(0, 250_000)).toBe(-100);
  });

  it("never returns NaN or Infinity", () => {
    const cases: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [999_999_999, 1],
    ];
    for (const [current, previous] of cases) {
      const result = percentDelta(current, previous);
      if (result !== null) expect(Number.isFinite(result)).toBe(true);
    }
  });
});
