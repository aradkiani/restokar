import { describe, expect, it } from "vitest";
import {
  jalaliMonthNames,
  jalaliMonthRange,
  jalaliMonthStart,
  jalaliQuarterRange,
  toJalali,
  toJalaliInZone,
} from "./jalali";
import { zonedParts } from "./time";

/** Independent read of a date's Jalali parts, used to check our own output. */
const icu = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function icuParts(date: Date) {
  const parts = icu.formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { jy: read("year"), jm: read("month"), jd: read("day") };
}

describe("toJalali", () => {
  it("converts known anchor dates", () => {
    // Nowruz 1405 — the Persian new year.
    expect(toJalali(new Date(2026, 2, 21))).toEqual({ jy: 1405, jm: 1, jd: 1 });
    // The day before is the last day of the preceding year.
    expect(toJalali(new Date(2026, 2, 20))).toEqual({ jy: 1404, jm: 12, jd: 29 });
  });

  it("agrees with ICU across a decade of dates", () => {
    const date = new Date(2020, 0, 1);
    while (date.getFullYear() < 2030) {
      expect(toJalali(date)).toEqual(icuParts(date));
      date.setDate(date.getDate() + 7);
    }
  });
});

describe("jalaliMonthStart", () => {
  it("lands on the 1st of the requested month for every month of many years", () => {
    for (let jy = 1398; jy <= 1412; jy++) {
      for (let jm = 1; jm <= 12; jm++) {
        const start = jalaliMonthStart(jy, jm);
        expect(toJalali(start)).toEqual({ jy, jm, jd: 1 });
        expect(start.getHours()).toBe(0);
      }
    }
  });

  it("puts Farvardin 1 on 20 or 21 March", () => {
    for (let jy = 1398; jy <= 1412; jy++) {
      const start = jalaliMonthStart(jy, 1);
      expect(start.getMonth()).toBe(2);
      expect([20, 21]).toContain(start.getDate());
    }
  });
});

/**
 * These windows are boundaries for *reports*, so they are anchored to the
 * venue's zone and read back with the zone reader. `toJalali` reads the host
 * clock, which agrees only when the process was started in Tehran — asserting
 * with it passed on the dev box while the boundary itself was a day out on a
 * UTC server.
 */
describe("jalaliMonthRange", () => {
  it("covers a whole month and nothing more", () => {
    for (let jy = 1400; jy <= 1410; jy++) {
      for (let jm = 1; jm <= 12; jm++) {
        const { from, to } = jalaliMonthRange(jy, jm);

        expect(toJalaliInZone(from)).toEqual({ jy, jm, jd: 1 });
        expect(toJalaliInZone(to).jy).toBe(jy);
        expect(toJalaliInZone(to).jm).toBe(jm);

        // The instant after the window belongs to the next month.
        const next = new Date(to.getTime() + 1);
        expect(toJalaliInZone(next).jm).not.toBe(jm);

        expect(zonedParts(to).hour).toBe(23);
        expect(zonedParts(to).minute).toBe(59);
      }
    }
  });

  it("gives 31 days to the first six months and 30 to the next five", () => {
    const days = ({ from, to }: { from: Date; to: Date }) =>
      Math.round((to.getTime() - from.getTime()) / 86_400_000);

    for (let jm = 1; jm <= 6; jm++) {
      expect(days(jalaliMonthRange(1405, jm))).toBe(31);
    }
    for (let jm = 7; jm <= 11; jm++) {
      expect(days(jalaliMonthRange(1405, jm))).toBe(30);
    }
  });

  it("handles Esfand in both common and leap years", () => {
    const days = ({ from, to }: { from: Date; to: Date }) =>
      Math.round((to.getTime() - from.getTime()) / 86_400_000);

    // 1403 is a leap year (Esfand has 30 days), 1405 is not (29).
    expect(days(jalaliMonthRange(1403, 12))).toBe(30);
    expect(days(jalaliMonthRange(1405, 12))).toBe(29);
  });

  it("rolls Esfand into the next Jalali year", () => {
    const { to } = jalaliMonthRange(1405, 12);
    expect(toJalaliInZone(new Date(to.getTime() + 1))).toEqual({
      jy: 1406,
      jm: 1,
      jd: 1,
    });
  });

  /** Adjacent months must abut exactly — no gap, no shared millisecond. */
  it("hands over cleanly to the following month", () => {
    const shahrivar = jalaliMonthRange(1405, 6);
    const mehr = jalaliMonthRange(1405, 7);
    expect(mehr.from.getTime() - shahrivar.to.getTime()).toBe(1);
  });
});

describe("jalaliQuarterRange", () => {
  // The picker asks for a starting month, so the window runs forward.
  it("spans the three months beginning with the given one", () => {
    const { from, to } = jalaliQuarterRange(1405, 4);
    expect(toJalaliInZone(from)).toEqual({ jy: 1405, jm: 4, jd: 1 });
    expect(toJalaliInZone(to).jm).toBe(6);
  });

  it("wraps forwards across the new year", () => {
    const { from, to } = jalaliQuarterRange(1404, 12);
    expect(toJalaliInZone(from)).toEqual({ jy: 1404, jm: 12, jd: 1 });
    expect(toJalaliInZone(to)).toMatchObject({ jy: 1405, jm: 2 });
    expect(from.getTime()).toBeLessThan(to.getTime());
  });

  it("starts the Iranian fiscal year at Farvardin", () => {
    const { from, to } = jalaliQuarterRange(1405, 1);
    expect(toJalaliInZone(from)).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(toJalaliInZone(to).jm).toBe(3);
  });
});

describe("jalaliMonthNames", () => {
  it("pairs each month number with its own name", () => {
    const names = jalaliMonthNames(1405);
    expect(names).toHaveLength(12);
    expect(names[0]).toBe("فروردین");
    expect(names[4]).toBe("مرداد");
    expect(names[11]).toBe("اسفند");
  });

  it("is stable across years", () => {
    expect(jalaliMonthNames(1403)).toEqual(jalaliMonthNames(1410));
  });
});
