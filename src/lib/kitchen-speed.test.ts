import { describe, expect, it } from "vitest";
import {
  ORDER_WARN_MINUTES,
  PREP_OUTLIER_MINUTES,
  minutesBetween,
  percentile,
  summariseKitchenSpeed,
  waitLevel,
  type PrepSample,
} from "./kitchen-speed";
import { ORDER_URGENT_MINUTES } from "./constants";

const base = new Date("2026-10-01T09:00:00Z");
function sample(
  minutes: number,
  extra: Partial<Pick<PrepSample, "hour" | "serviceType">> = {},
): PrepSample {
  return {
    placedAt: base,
    readyAt: new Date(base.getTime() + minutes * 60_000),
    serviceType: extra.serviceType ?? "DINE_IN",
    hour: extra.hour ?? 12,
  };
}

describe("waitLevel", () => {
  it("warns before it alarms", () => {
    expect(ORDER_WARN_MINUTES).toBeLessThan(ORDER_URGENT_MINUTES);
    expect(waitLevel(0)).toBe("ok");
    expect(waitLevel(ORDER_WARN_MINUTES - 1)).toBe("ok");
    expect(waitLevel(ORDER_WARN_MINUTES)).toBe("warn");
    expect(waitLevel(ORDER_URGENT_MINUTES - 1)).toBe("warn");
    expect(waitLevel(ORDER_URGENT_MINUTES)).toBe("late");
  });
});

describe("minutesBetween", () => {
  it("floors and never goes negative", () => {
    expect(minutesBetween(base, new Date(base.getTime() + 90_000))).toBe(1);
    expect(minutesBetween(base, new Date(base.getTime() - 60_000))).toBe(0);
  });
});

describe("percentile", () => {
  it("uses nearest rank, so the answer is a value that happened", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 90)).toBe(9);
    expect(percentile(sorted, 100)).toBe(10);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("summariseKitchenSpeed", () => {
  it("reports nothing rather than zero when nothing was measured", () => {
    const speed = summariseKitchenSpeed([]);
    expect(speed).toMatchObject({
      measured: 0,
      skipped: 0,
      median: null,
      average: null,
      p90: null,
      withinTarget: null,
      byHour: [],
    });
  });

  it("leaves bookkeeping out of the cooking time", () => {
    const speed = summariseKitchenSpeed([
      sample(10),
      sample(20),
      sample(PREP_OUTLIER_MINUTES + 1),
      sample(60 * 24),
    ]);
    expect(speed.measured).toBe(2);
    expect(speed.skipped).toBe(2);
    expect(speed.average).toBe(15);
  });

  it("computes median, p90 and the share within target", () => {
    const minutes = [5, 8, 10, 12, 14, 15, 18, 22, 30, 40];
    const speed = summariseKitchenSpeed(
      minutes.map((m) => sample(m)),
      20,
    );
    expect(speed.median).toBe(14);
    expect(speed.p90).toBe(30);
    expect(speed.withinTarget).toBeCloseTo(0.7);
    expect(speed.average).toBe(17);
  });

  it("splits by hour and by service type", () => {
    const speed = summariseKitchenSpeed([
      sample(10, { hour: 13 }),
      sample(30, { hour: 13 }),
      sample(20, { hour: 13 }),
      sample(8, { hour: 9, serviceType: "TAKEAWAY" }),
    ]);
    expect(speed.byHour).toEqual([
      { hour: 9, median: 8, count: 1 },
      { hour: 13, median: 20, count: 3 },
    ]);
    expect(speed.byService.DINE_IN).toEqual({ median: 20, count: 3 });
    expect(speed.byService.TAKEAWAY).toEqual({ median: 8, count: 1 });
  });
});
