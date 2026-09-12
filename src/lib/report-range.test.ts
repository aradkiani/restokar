import { describe, expect, it } from "vitest";
import { isWindowTooWide, resolveReportWindow } from "./report-range";
import { monthRange, quarterRange } from "./reports";
import { rangeLengthInDays, resolveRange } from "./analytics";
import { ReportQuerySchema } from "./validation";
import { zonedParts } from "./time";

/**
 * Report windows decide which rows a document contains, so an off-by-one here
 * silently reports the wrong month. These pin the boundaries.
 *
 * Every assertion reads the boundary in the **venue's** zone rather than with
 * `getMonth()`/`getDate()`. Those read the host clock, which agrees with the
 * venue only when the process happens to have been started in Tehran — so the
 * old assertions passed on the dev box and hid a real defect: built on the
 * host's calendar and then re-anchored by `resolveRange`, a March report on a
 * UTC server covered 32 days and counted 1 April in both March and April.
 * Written this way these run identically under any `TZ`.
 */
const on = (date: Date) => zonedParts(date);

describe("monthRange", () => {
  it("spans the first to the last day of the month", () => {
    const march = monthRange(2026, 3);
    expect(on(march.from).day).toBe(1);
    expect(on(march.from).month).toBe(3);
    expect(on(march.to).day).toBe(31);
    expect(rangeLengthInDays(resolveRange(march))).toBe(31);
  });

  it("handles a leap February", () => {
    expect(on(monthRange(2024, 2).to).day).toBe(29);
    expect(on(monthRange(2026, 2).to).day).toBe(28);
    expect(rangeLengthInDays(resolveRange(monthRange(2024, 2)))).toBe(29);
  });

  it("covers the very end of the last day", () => {
    // An order at 23:59 on the 31st belongs to that month's takings.
    const march = monthRange(2026, 3);
    expect(on(march.to).hour).toBe(23);
    expect(on(march.to).minute).toBe(59);
  });

  /** Adjacent months must abut exactly — no gap, no shared millisecond. */
  it("hands over cleanly to the following month", () => {
    const march = monthRange(2026, 3);
    const april = monthRange(2026, 4);
    expect(april.from.getTime() - march.to.getTime()).toBe(1);
  });
});

describe("quarterRange", () => {
  // The picker calls this the "starting month", so the window runs forward.
  it("spans three whole months beginning with the given one", () => {
    const q1 = quarterRange(2026, 1);
    expect(on(q1.from).month).toBe(1); // January
    expect(on(q1.from).day).toBe(1);
    expect(on(q1.to).month).toBe(3); // March
    expect(on(q1.to).day).toBe(31);
    expect(rangeLengthInDays(resolveRange(q1))).toBe(90); // 31 + 28 + 31
  });

  it("rolls forward across a year boundary", () => {
    const window = quarterRange(2026, 11); // Nov 2026 → Jan 2027
    expect(on(window.from).year).toBe(2026);
    expect(on(window.from).month).toBe(11);
    expect(on(window.to).year).toBe(2027);
    expect(on(window.to).month).toBe(1);
    expect(on(window.to).day).toBe(31);
  });

  it("ends on the real last day of a short third month", () => {
    // Dec 2025 → Feb 2026, and 2026 is not a leap year.
    const window = quarterRange(2025, 12);
    expect(on(window.to).year).toBe(2026);
    expect(on(window.to).month).toBe(2);
    expect(on(window.to).day).toBe(28);
  });
});

describe("resolveReportWindow", () => {
  it("parses a custom range in the venue's zone, not UTC or the host's", () => {
    const { range } = resolveReportWindow(
      ReportQuerySchema.parse({ preset: "custom", from: "2026-03-01", to: "2026-03-15" }),
    );
    expect(on(range.from).day).toBe(1);
    expect(on(range.from).month).toBe(3);
    expect(on(range.to).day).toBe(15);
    expect(rangeLengthInDays(resolveRange(range))).toBe(15);
  });

  it("falls back to the current month when no anchor is given", () => {
    const { range, preset } = resolveReportWindow(ReportQuerySchema.parse({}));
    expect(preset).toBe("month");
    expect(on(range.from).month).toBe(on(new Date()).month);
    expect(on(range.from).day).toBe(1);
  });
});

describe("ReportQuerySchema", () => {
  it("requires both dates for a custom range", () => {
    expect(
      ReportQuerySchema.safeParse({ preset: "custom", from: "2026-03-01" }).success,
    ).toBe(false);
  });

  it("rejects a reversed range", () => {
    const result = ReportQuerySchema.safeParse({
      preset: "custom",
      from: "2026-03-31",
      to: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      ReportQuerySchema.safeParse({
        preset: "custom",
        from: "01-03-2026",
        to: "2026-03-31",
      }).success,
    ).toBe(false);
  });

  it("carries no restaurant identifier", () => {
    // The tenant must come from the session; a schema field would be a way in.
    // Zod strips unknown keys, so an injected tenant id cannot survive parsing
    // and reach a query.
    const parsed = ReportQuerySchema.parse({
      preset: "month",
      restaurantId: "someone-elses-id",
    });
    expect("restaurantId" in parsed).toBe(false);
  });
});

describe("resolveReportWindow — Jalali anchors", () => {
  it("resolves a Jalali month to the Gregorian window it actually covers", () => {
    // Mordad 1405 runs 23 July → 22 August 2026, not 1–31 August.
    const { range } = resolveReportWindow(
      ReportQuerySchema.parse({
        preset: "month",
        calendar: "jalali",
        year: 1405,
        month: 5,
      }),
    );

    expect(on(range.from).year).toBe(2026);
    expect(on(range.from).month).toBe(7); // July
    expect(on(range.from).day).toBe(23);
    expect(on(range.to).month).toBe(8); // August
    expect(on(range.to).day).toBe(22);
  });

  it("reads the same year/month differently per calendar", () => {
    const jalali = resolveReportWindow(
      ReportQuerySchema.parse({
        preset: "month",
        calendar: "jalali",
        year: 1405,
        month: 1,
      }),
    ).range;
    const gregorian = resolveReportWindow(
      ReportQuerySchema.parse({ preset: "month", year: 2026, month: 1 }),
    ).range;

    expect(on(jalali.from).month).toBe(3); // Farvardin starts in March
    expect(on(gregorian.from).month).toBe(1); // January
  });

  it("defaults to gregorian so existing links keep their meaning", () => {
    expect(ReportQuerySchema.parse({ preset: "month" }).calendar).toBe("gregorian");
  });

  it("accepts Jalali years that the Gregorian bound would have rejected", () => {
    expect(
      ReportQuerySchema.safeParse({ preset: "month", calendar: "jalali", year: 1405 })
        .success,
    ).toBe(true);
  });

  it("spans three Jalali months for the quarter preset", () => {
    const { range } = resolveReportWindow(
      ReportQuerySchema.parse({
        preset: "quarter",
        calendar: "jalali",
        year: 1405,
        month: 1,
      }),
    );
    // Farvardin 1 → Khordad 31 is the first Iranian quarter: 31+31+31 days.
    expect(on(range.from).month).toBe(3); // March
    expect(on(range.from).day).toBe(21);
    expect(rangeLengthInDays(resolveRange(range))).toBe(93);
  });
});

describe("isWindowTooWide", () => {
  it("accepts a year and rejects a decade", () => {
    const year = { from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) };
    const decade = { from: new Date(2016, 0, 1), to: new Date(2026, 0, 1) };
    expect(isWindowTooWide(year)).toBe(false);
    expect(isWindowTooWide(decade)).toBe(true);
  });
});
