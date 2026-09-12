import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, endOfDayInZone, startOfDayInZone, zonedParts } from "./time";

/**
 * Every expectation here is an absolute UTC instant.
 *
 * That is the point of the suite rather than an incidental style: an assertion
 * written against the *host's* idea of midnight passes everywhere and proves
 * nothing. These values are only correct if the host zone is ignored entirely,
 * so the suite fails on a UTC runner the moment the day boundary starts coming
 * from `setHours` again. Tehran runs at a fixed +03:30 with no daylight saving,
 * which is what makes each figure below checkable by hand.
 */

describe("zonedParts", () => {
  it("reads the wall clock in the app zone, not the host zone", () => {
    // 18:00 UTC is 21:30 the same evening in Tehran.
    expect(zonedParts(new Date("2026-09-07T18:00:00Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 7,
      hour: 21,
      minute: 30,
      second: 0,
    });
  });

  it("reports midnight as hour 0 rather than hour 24", () => {
    expect(zonedParts(new Date("2026-09-06T20:30:00Z")).hour).toBe(0);
  });
});

describe("startOfDayInZone", () => {
  it("returns the zone's midnight for an evening instant", () => {
    expect(startOfDayInZone(new Date("2026-09-07T18:00:00Z")).toISOString()).toBe(
      "2026-09-06T20:30:00.000Z",
    );
  });

  it("is idempotent — midnight is already the start of its own day", () => {
    const midnight = new Date("2026-09-06T20:30:00.000Z");
    expect(startOfDayInZone(midnight).toISOString()).toBe(midnight.toISOString());
  });

  /**
   * The regression this module exists for.
   *
   * 20:29:59Z is 23:59:59 in Tehran — still today — while a host running UTC
   * has already rolled over to tomorrow. The old `setHours(0,0,0,0)` filed this
   * order under the wrong trading day; the boundary below keeps it in the day
   * the restaurant actually served it.
   */
  it("keeps a late-evening order inside the day the venue served it", () => {
    expect(startOfDayInZone(new Date("2026-09-06T20:29:59Z")).toISOString()).toBe(
      "2026-09-05T20:30:00.000Z",
    );
  });

  it("shifts by whole calendar days", () => {
    expect(startOfDayInZone(new Date("2026-09-07T18:00:00Z"), -6).toISOString()).toBe(
      "2026-08-31T20:30:00.000Z",
    );
  });

  it("crosses month and year boundaries", () => {
    expect(startOfDayInZone(new Date("2027-01-01T12:00:00Z"), -1).toISOString()).toBe(
      "2026-12-30T20:30:00.000Z",
    );
  });
});

describe("endOfDayInZone", () => {
  it("ends one millisecond before the next day begins", () => {
    expect(endOfDayInZone(new Date("2026-09-07T18:00:00Z")).toISOString()).toBe(
      "2026-09-07T20:29:59.999Z",
    );
  });

  it("brackets the instant it was asked about", () => {
    const instant = new Date("2026-09-07T18:00:00Z");
    expect(startOfDayInZone(instant).getTime()).toBeLessThanOrEqual(instant.getTime());
    expect(endOfDayInZone(instant).getTime()).toBeGreaterThanOrEqual(instant.getTime());
  });

  it("spans exactly one day in a zone with no daylight saving", () => {
    const instant = new Date("2026-07-01T12:00:00Z");
    const span = endOfDayInZone(instant).getTime() - startOfDayInZone(instant).getTime();
    expect(span).toBe(86_400_000 - 1);
  });
});

describe("APP_TIME_ZONE", () => {
  it("is a zone the runtime actually knows", () => {
    expect(() =>
      new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE }).format(new Date()),
    ).not.toThrow();
  });
});
