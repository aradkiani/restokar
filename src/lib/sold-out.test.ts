import { describe, expect, it } from "vitest";
import { soldOutUntil } from "./sold-out";
import { resolveAvailability } from "./availability";

// Tehran is UTC+03:30 all year.
const tehran = (iso: string) => new Date(`${iso}+03:30`);

describe("sold out", () => {
  it("lasts until 05:00 the next morning when marked during the day", () => {
    expect(soldOutUntil(tehran("2026-10-04T13:00:00"))).toEqual(
      tehran("2026-10-05T05:00:00"),
    );
  });

  it("does not come back at midnight for a kitchen still serving", () => {
    expect(soldOutUntil(tehran("2026-10-04T23:30:00"))).toEqual(
      tehran("2026-10-05T05:00:00"),
    );
  });

  it("marked after midnight, it lasts until 05:00 the same morning", () => {
    expect(soldOutUntil(tehran("2026-10-05T01:15:00"))).toEqual(
      tehran("2026-10-05T05:00:00"),
    );
  });

  it("makes a dish unavailable with its own reason, after the manual switch", () => {
    const base = { isAvailable: true, product: { scheduleEnabled: false, windows: [] } };
    const at = { dayOfWeek: 1, minuteOfDay: 600 };
    expect(resolveAvailability({ ...base, soldOut: true }, at)).toEqual({
      available: false,
      reason: "soldOut",
    });
    expect(
      resolveAvailability({ ...base, isAvailable: false, soldOut: true }, at).reason,
    ).toBe("manual");
    expect(resolveAvailability(base, at).available).toBe(true);
  });
});
