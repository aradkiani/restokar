import { describe, expect, it } from "vitest";
import {
  CALENDAR_DAY,
  businessDateKey,
  businessDayWindow,
  cutoffMinute,
  dbDate,
  effectiveHours,
  keyOfDbDate,
  minuteToClock,
  shiftDateKey,
} from "./business-day";

/** A Tehran wall-clock time as an instant (Iran is UTC+03:30, no DST). */
const tehran = (wall: string) => new Date(`${wall}+03:30`);
const h = (start: string, end: string) => {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return { start: m(start), end: m(end) };
};

describe("cutoffMinute", () => {
  it("is the middle of the closed hours", () => {
    expect(minuteToClock(cutoffMinute(h("17:00", "03:00")))).toBe("10:00");
    expect(minuteToClock(cutoffMinute(h("08:00", "23:00")))).toBe("03:30");
    expect(minuteToClock(cutoffMinute(h("12:00", "00:00")))).toBe("06:00");
  });

  it("is the opening time for a venue that never closes, midnight by default", () => {
    expect(cutoffMinute(h("06:00", "06:00"))).toBe(360);
    expect(cutoffMinute(CALENDAR_DAY)).toBe(0);
  });
});

describe("businessDateKey", () => {
  it("files an order after midnight under the evening it belongs to", () => {
    const evening = h("17:00", "03:00");
    expect(businessDateKey(tehran("2026-10-05T01:30:00"), evening)).toBe("2026-10-04");
    expect(businessDateKey(tehran("2026-10-04T18:00:00"), evening)).toBe("2026-10-04");
    expect(businessDateKey(tehran("2026-10-04T23:59:00"), evening)).toBe("2026-10-04");
    // After the 10:00 cut-off the new day has begun.
    expect(businessDateKey(tehran("2026-10-05T10:00:00"), evening)).toBe("2026-10-05");
  });

  it("keeps a daytime venue's late stragglers on the same day", () => {
    const daytime = h("08:00", "23:00");
    expect(businessDateKey(tehran("2026-10-04T23:40:00"), daytime)).toBe("2026-10-04");
    expect(businessDateKey(tehran("2026-10-05T02:00:00"), daytime)).toBe("2026-10-04");
    expect(businessDateKey(tehran("2026-10-05T07:30:00"), daytime)).toBe("2026-10-05");
  });

  it("is the calendar date by default", () => {
    expect(businessDateKey(tehran("2026-10-05T00:01:00"), CALENDAR_DAY)).toBe(
      "2026-10-05",
    );
    expect(businessDateKey(tehran("2026-10-04T23:59:00"), CALENDAR_DAY)).toBe(
      "2026-10-04",
    );
  });

  it("names a day by the date it opens, even when its quiet hours are the night before", () => {
    // Opens 02:00, closes 18:00: cut-off 22:00 the evening before.
    const early = h("02:00", "18:00");
    expect(businessDateKey(tehran("2026-10-05T10:00:00"), early)).toBe("2026-10-05");
    expect(businessDateKey(tehran("2026-10-04T23:00:00"), early)).toBe("2026-10-05");
    expect(businessDateKey(tehran("2026-10-04T21:00:00"), early)).toBe("2026-10-04");
  });

  it("crosses months and years", () => {
    const evening = h("17:00", "03:00");
    expect(businessDateKey(tehran("2027-01-01T01:00:00"), evening)).toBe("2026-12-31");
  });
});

describe("businessDayWindow", () => {
  it("is the 24 hours from one cut-off to the next, and agrees with the key", () => {
    const evening = h("17:00", "03:00");
    const { from, to } = businessDayWindow("2026-10-04", evening);
    expect(from).toEqual(tehran("2026-10-04T10:00:00"));
    expect(to).toEqual(tehran("2026-10-05T10:00:00"));
    expect(businessDateKey(from, evening)).toBe("2026-10-04");
    expect(businessDateKey(new Date(to.getTime() - 1), evening)).toBe("2026-10-04");
    expect(businessDateKey(to, evening)).toBe("2026-10-05");
  });

  it("starts the evening before for a day whose cut-off is later than its opening", () => {
    const early = h("02:00", "18:00");
    const { from } = businessDayWindow("2026-10-05", early);
    expect(from).toEqual(tehran("2026-10-04T22:00:00"));
  });
});

describe("helpers", () => {
  it("round-trips a date column value", () => {
    expect(keyOfDbDate(dbDate("2026-10-04"))).toBe("2026-10-04");
  });

  it("shifts date keys across month ends", () => {
    expect(shiftDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lets a branch inherit its chain's hours unless it has its own", () => {
    const parent = { businessDayStart: 17 * 60, businessDayEnd: 3 * 60 };
    expect(
      effectiveHours({ businessDayStart: null, businessDayEnd: null }, parent),
    ).toEqual({
      start: 1020,
      end: 180,
    });
    expect(
      effectiveHours({ businessDayStart: 480, businessDayEnd: 1380 }, parent),
    ).toEqual({
      start: 480,
      end: 1380,
    });
    expect(
      effectiveHours({ businessDayStart: null, businessDayEnd: null }, null),
    ).toEqual(CALENDAR_DAY);
  });
});
