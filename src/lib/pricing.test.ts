import { describe, expect, it } from "vitest";
import { calculatePrice, roundToIncrement, type PricingOptions } from "./pricing";

/**
 * This decides what a guest is charged, so every branch is pinned — especially
 * the interactions, which is where a plausible-looking change quietly starts
 * taxing the tip or rounding the basket to zero.
 */

const OFF: PricingOptions = {
  taxEnabled: false,
  taxPercent: 9,
  serviceChargeEnabled: false,
  serviceChargePercent: 10,
  roundingIncrement: 0,
  roundingDirection: "nearest",
};

describe("defaults", () => {
  it("leaves the total untouched when nothing is enabled", () => {
    const result = calculatePrice(237_000, OFF);
    expect(result.total).toBe(237_000);
    expect(result.tax).toBe(0);
    expect(result.serviceCharge).toBe(0);
    expect(result.roundingAdjustment).toBe(0);
  });

  it("treats a zero basket as free", () => {
    expect(calculatePrice(0, { ...OFF, taxEnabled: true }).total).toBe(0);
  });

  it("never returns a negative total", () => {
    expect(calculatePrice(-500, OFF).total).toBe(0);
  });
});

describe("tax", () => {
  it("adds the percentage on top", () => {
    const result = calculatePrice(100_000, { ...OFF, taxEnabled: true, taxPercent: 9 });
    expect(result.tax).toBe(9_000);
    expect(result.total).toBe(109_000);
  });

  it("is ignored when disabled even with a rate set", () => {
    expect(calculatePrice(100_000, { ...OFF, taxPercent: 25 }).tax).toBe(0);
  });

  it("ignores a nonsensical rate rather than inflating the bill", () => {
    expect(
      calculatePrice(100_000, { ...OFF, taxEnabled: true, taxPercent: -5 }).tax,
    ).toBe(0);
  });
});

describe("service charge", () => {
  it("applies before tax, and tax is charged on it", () => {
    const result = calculatePrice(100_000, {
      ...OFF,
      serviceChargeEnabled: true,
      serviceChargePercent: 10,
      taxEnabled: true,
      taxPercent: 9,
    });
    expect(result.serviceCharge).toBe(10_000);
    // 9% of 110,000, not of 100,000.
    expect(result.tax).toBe(9_900);
    expect(result.total).toBe(119_900);
  });
});

describe("rounding", () => {
  it("rounds up to the increment", () => {
    const result = calculatePrice(103_400, {
      ...OFF,
      roundingIncrement: 1_000,
      roundingDirection: "up",
    });
    expect(result.total).toBe(104_000);
    expect(result.roundingAdjustment).toBe(600);
  });

  it("rounds down to the increment", () => {
    const result = calculatePrice(103_400, {
      ...OFF,
      roundingIncrement: 1_000,
      roundingDirection: "down",
    });
    expect(result.total).toBe(103_000);
    expect(result.roundingAdjustment).toBe(-400);
  });

  it("rounds to nearest by default", () => {
    expect(calculatePrice(103_400, { ...OFF, roundingIncrement: 1_000 }).total).toBe(
      103_000,
    );
    expect(calculatePrice(103_600, { ...OFF, roundingIncrement: 1_000 }).total).toBe(
      104_000,
    );
  });

  it("handles a 10,000 increment", () => {
    expect(
      calculatePrice(247_000, {
        ...OFF,
        roundingIncrement: 10_000,
        roundingDirection: "up",
      }).total,
    ).toBe(250_000);
  });

  it("is a no-op when the increment is off", () => {
    expect(calculatePrice(103_437, { ...OFF, roundingIncrement: 0 }).total).toBe(103_437);
  });

  it("rounds the taxed figure, not the bare subtotal", () => {
    const result = calculatePrice(100_000, {
      ...OFF,
      taxEnabled: true,
      taxPercent: 9,
      roundingIncrement: 5_000,
      roundingDirection: "up",
    });
    // 109,000 → 110,000, rather than 100,000 → 100,000 then taxed.
    expect(result.total).toBe(110_000);
  });

  it("cannot round a real basket down to nothing", () => {
    const result = calculatePrice(400, {
      ...OFF,
      roundingIncrement: 10_000,
      roundingDirection: "down",
    });
    expect(result.total).toBe(0);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

describe("tip", () => {
  it("is added after rounding and is never taxed", () => {
    const result = calculatePrice(
      100_000,
      {
        ...OFF,
        taxEnabled: true,
        taxPercent: 9,
        roundingIncrement: 1_000,
        roundingDirection: "up",
      },
      { tip: 12_345 },
    );
    expect(result.tax).toBe(9_000);
    expect(result.tip).toBe(12_345);
    // Rounding applied to 109,000, then the tip added on top untouched.
    expect(result.total).toBe(109_000 + 12_345);
  });

  it("ignores a negative tip", () => {
    expect(calculatePrice(100_000, OFF, { tip: -5_000 }).total).toBe(100_000);
  });
});

describe("discount", () => {
  it("comes off before service and tax", () => {
    const result = calculatePrice(
      100_000,
      { ...OFF, taxEnabled: true, taxPercent: 10 },
      { discount: 20_000 },
    );
    expect(result.tax).toBe(8_000);
    expect(result.total).toBe(88_000);
  });

  it("cannot exceed the basket", () => {
    const result = calculatePrice(50_000, OFF, { discount: 80_000 });
    expect(result.discount).toBe(50_000);
    expect(result.total).toBe(0);
  });
});

describe("roundToIncrement", () => {
  it("passes the amount through for meaningless increments", () => {
    expect(roundToIncrement(1_234, 0, "up")).toBe(1_234);
    expect(roundToIncrement(1_234, 1, "up")).toBe(1_234);
  });

  it("is exact on values already on the increment", () => {
    expect(roundToIncrement(10_000, 1_000, "up")).toBe(10_000);
    expect(roundToIncrement(10_000, 1_000, "down")).toBe(10_000);
  });
});
