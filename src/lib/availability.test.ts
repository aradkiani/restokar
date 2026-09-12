import { describe, expect, it } from "vitest";
import {
  formatTimeOfDay,
  parseTimeOfDay,
  resolveAvailability,
  scheduleAllows,
  windowCovers,
  type ScheduleWindow,
} from "./availability";
import type { ZonedMoment } from "./time";

const SUN = 0;
const MON = 1;
const TUE = 2;
const FRI = 5;
const SAT = 6;

/** `at("18:30", SAT)` — reads the way the schedules under test are written. */
function at(time: string, dayOfWeek: number): ZonedMoment {
  const minuteOfDay = parseTimeOfDay(time);
  if (minuteOfDay === null) throw new Error(`bad test time: ${time}`);
  return { dayOfWeek, minuteOfDay };
}

function window(dayOfWeek: number, start: string, end: string): ScheduleWindow {
  return {
    dayOfWeek,
    startMinute: parseTimeOfDay(start)!,
    endMinute: parseTimeOfDay(end)!,
  };
}

const open = (windows: ScheduleWindow[]) => ({ scheduleEnabled: true, windows });

describe("windowCovers — same-day windows", () => {
  const dinner = window(SAT, "18:00", "23:00");

  it("is open in the middle of its window", () => {
    expect(windowCovers(dinner, at("20:30", SAT))).toBe(true);
  });

  it("is open at exactly the start minute", () => {
    expect(windowCovers(dinner, at("18:00", SAT))).toBe(true);
  });

  /**
   * Half-open on purpose. A window ending at 23:00 and one starting at 23:00
   * must hand over cleanly rather than both claiming the same minute.
   */
  it("is closed at exactly the end minute", () => {
    expect(windowCovers(dinner, at("23:00", SAT))).toBe(false);
  });

  it("is closed a minute before it opens", () => {
    expect(windowCovers(dinner, at("17:59", SAT))).toBe(false);
  });

  it("is closed on a different day at the same time", () => {
    expect(windowCovers(dinner, at("20:30", SUN))).toBe(false);
  });
});

describe("windowCovers — midnight edges", () => {
  it("treats an end of 24:00 as the end of its own day, not as overnight", () => {
    const evening = window(SAT, "18:00", "24:00");
    expect(windowCovers(evening, at("23:59", SAT))).toBe(true);
    // Midnight belongs to Sunday, and this window does not reach into Sunday.
    expect(windowCovers(evening, at("00:00", SUN))).toBe(false);
  });

  it("handles a window that starts at midnight", () => {
    const smallHours = window(SUN, "00:00", "02:00");
    expect(windowCovers(smallHours, at("00:00", SUN))).toBe(true);
    expect(windowCovers(smallHours, at("01:59", SUN))).toBe(true);
    expect(windowCovers(smallHours, at("02:00", SUN))).toBe(false);
  });

  it("supports an all-day window", () => {
    const allDay = window(FRI, "00:00", "24:00");
    expect(windowCovers(allDay, at("00:00", FRI))).toBe(true);
    expect(windowCovers(allDay, at("23:59", FRI))).toBe(true);
    expect(windowCovers(allDay, at("12:00", SAT))).toBe(false);
  });
});

/**
 * The case a naive `start <= now && now <= end` gets wrong: it reports the
 * whole second half of every late-night window as closed, which is the half a
 * late kitchen actually trades in.
 */
describe("windowCovers — overnight windows", () => {
  const lateNight = window(SAT, "18:00", "02:00");

  it("is open on the evening it starts", () => {
    expect(windowCovers(lateNight, at("18:00", SAT))).toBe(true);
    expect(windowCovers(lateNight, at("23:59", SAT))).toBe(true);
  });

  it("is open in the small hours of the following day", () => {
    expect(windowCovers(lateNight, at("00:00", SUN))).toBe(true);
    expect(windowCovers(lateNight, at("01:59", SUN))).toBe(true);
  });

  it("closes at the end minute on the following day", () => {
    expect(windowCovers(lateNight, at("02:00", SUN))).toBe(false);
  });

  it("is closed during the day it started, before it opens", () => {
    expect(windowCovers(lateNight, at("12:00", SAT))).toBe(false);
  });

  it("does not leak into the morning of its own day", () => {
    expect(windowCovers(lateNight, at("01:00", SAT))).toBe(false);
  });

  it("wraps from Saturday round to Sunday", () => {
    // Saturday is 6; the morning half must land on 0, not on 7.
    expect(windowCovers(window(SAT, "22:00", "03:00"), at("02:00", SUN))).toBe(true);
  });
});

describe("scheduleAllows", () => {
  it("allows everything when there are no windows at all", () => {
    // The default for every product that existed before this feature.
    expect(scheduleAllows(open([]), at("04:00", TUE))).toBe(true);
  });

  it("allows everything when the owner has switched scheduling off", () => {
    const suspended = {
      scheduleEnabled: false,
      windows: [window(SAT, "18:00", "23:00")],
    };
    expect(scheduleAllows(suspended, at("04:00", SUN))).toBe(true);
  });

  it("keeps the windows when scheduling is switched off", () => {
    const suspended = {
      scheduleEnabled: false,
      windows: [window(SAT, "18:00", "23:00")],
    };
    expect(suspended.windows).toHaveLength(1);
  });

  it("refuses a moment no window covers", () => {
    expect(scheduleAllows(open([window(SAT, "18:00", "23:00")]), at("12:00", SAT))).toBe(
      false,
    );
  });

  it("supports several windows in one day", () => {
    const split = open([window(SAT, "07:00", "11:00"), window(SAT, "16:00", "18:00")]);

    expect(scheduleAllows(split, at("08:00", SAT))).toBe(true);
    expect(scheduleAllows(split, at("17:00", SAT))).toBe(true);
    // The gap between the two services.
    expect(scheduleAllows(split, at("13:00", SAT))).toBe(false);
  });

  it("supports different hours on different days", () => {
    const week = open([
      window(SAT, "08:00", "12:00"),
      window(SUN, "08:00", "12:00"),
      window(FRI, "10:00", "14:00"),
    ]);

    expect(scheduleAllows(week, at("09:00", SAT))).toBe(true);
    expect(scheduleAllows(week, at("09:00", FRI))).toBe(false);
    expect(scheduleAllows(week, at("13:00", FRI))).toBe(true);
    // Monday was never listed.
    expect(scheduleAllows(week, at("09:00", MON))).toBe(false);
  });

  /**
   * Overlaps union rather than conflict, so there is never a contradiction to
   * resolve and no reason to reject them on input.
   */
  it("unions overlapping windows", () => {
    const overlapping = open([
      window(SAT, "09:00", "13:00"),
      window(SAT, "12:00", "15:00"),
    ]);

    expect(scheduleAllows(overlapping, at("12:30", SAT))).toBe(true);
    expect(scheduleAllows(overlapping, at("14:00", SAT))).toBe(true);
    expect(scheduleAllows(overlapping, at("08:59", SAT))).toBe(false);
    expect(scheduleAllows(overlapping, at("15:00", SAT))).toBe(false);
  });
});

describe("resolveAvailability", () => {
  const lunch = open([window(SAT, "12:00", "17:00")]);
  const unscheduled = open([]);

  it("leaves an unscheduled product exactly as it was", () => {
    expect(
      resolveAvailability(
        { isAvailable: true, product: unscheduled, category: unscheduled },
        at("03:00", SUN),
      ),
    ).toEqual({ available: true, reason: null });
  });

  it("still honours the manual unavailable switch", () => {
    expect(
      resolveAvailability({ isAvailable: false, product: unscheduled }, at("13:00", SAT)),
    ).toEqual({ available: false, reason: "manual" });
  });

  it("reports the manual switch even inside an open window", () => {
    expect(
      resolveAvailability({ isAvailable: false, product: lunch }, at("13:00", SAT))
        .reason,
    ).toBe("manual");
  });

  it("is available when both the product and its category are open", () => {
    expect(
      resolveAvailability(
        {
          isAvailable: true,
          product: lunch,
          category: open([window(SAT, "07:00", "24:00")]),
        },
        at("13:00", SAT),
      ),
    ).toEqual({ available: true, reason: null });
  });

  it("closes a product outside its own window", () => {
    expect(
      resolveAvailability({ isAvailable: true, product: lunch }, at("18:00", SAT)),
    ).toEqual({ available: false, reason: "schedule" });
  });

  /**
   * A closed category closes its products even when the product's own window is
   * open — otherwise a dish stays orderable by direct request after the service
   * it belongs to has ended.
   */
  it("closes a product whose category is closed, even inside the product window", () => {
    expect(
      resolveAvailability(
        {
          isAvailable: true,
          product: lunch,
          category: open([window(SAT, "07:00", "11:00")]),
        },
        at("13:00", SAT),
      ),
    ).toEqual({ available: false, reason: "category" });
  });

  it("reports the category before the product's own hours", () => {
    // Both are closed; "breakfast is over" is the useful explanation.
    expect(
      resolveAvailability(
        {
          isAvailable: true,
          product: lunch,
          category: open([window(SAT, "07:00", "11:00")]),
        },
        at("20:00", SAT),
      ).reason,
    ).toBe("category");
  });

  it("lets a category schedule govern an unscheduled product", () => {
    const breakfast = open([window(SAT, "07:00", "12:00")]);

    expect(
      resolveAvailability(
        { isAvailable: true, product: unscheduled, category: breakfast },
        at("08:00", SAT),
      ).available,
    ).toBe(true);
    expect(
      resolveAvailability(
        { isAvailable: true, product: unscheduled, category: breakfast },
        at("14:00", SAT),
      ).reason,
    ).toBe("category");
  });
});

describe("parseTimeOfDay", () => {
  it("reads a wall-clock time", () => {
    expect(parseTimeOfDay("00:00")).toBe(0);
    expect(parseTimeOfDay("07:30")).toBe(450);
    expect(parseTimeOfDay("23:59")).toBe(1439);
  });

  it("accepts 24:00 as the end of the day", () => {
    expect(parseTimeOfDay("24:00")).toBe(1440);
  });

  it("accepts a single-digit hour", () => {
    expect(parseTimeOfDay("7:30")).toBe(450);
  });

  it("rejects malformed input rather than throwing", () => {
    for (const bad of [
      "",
      "abc",
      "12",
      "12:",
      ":30",
      "12:60",
      "25:00",
      "24:01",
      "-1:00",
    ]) {
      expect(parseTimeOfDay(bad), bad).toBeNull();
    }
  });
});

describe("formatTimeOfDay", () => {
  it("round-trips with parseTimeOfDay", () => {
    for (const time of ["00:00", "07:30", "18:00", "23:59"]) {
      expect(formatTimeOfDay(parseTimeOfDay(time)!)).toBe(time);
    }
  });

  it("renders the end of the day as 24:00", () => {
    expect(formatTimeOfDay(1440)).toBe("24:00");
  });
});
