import { describe, expect, it } from "vitest";
import {
  effectiveLimits,
  effectivePrice,
  promoActive,
  snapshotLimits,
} from "./plan-terms";

const plan = {
  monthlyPrice: 900_000,
  yearlyPrice: 9_000_000,
  promoMonthlyPrice: null as number | null,
  promoYearlyPrice: null as number | null,
  promoStartsAt: null as Date | null,
  promoEndsAt: null as Date | null,
};
const now = new Date("2026-10-03T10:00:00Z");

describe("plan price", () => {
  it("charges the regular price without a promotion", () => {
    expect(effectivePrice(plan, "monthly", now)).toEqual({
      amount: 900_000,
      regular: null,
    });
    expect(effectivePrice(plan, "yearly", now)).toEqual({
      amount: 9_000_000,
      regular: null,
    });
  });

  it("charges the promotion inside its window and shows the regular price", () => {
    const promo = {
      ...plan,
      promoMonthlyPrice: 700_000,
      promoStartsAt: new Date("2026-10-01T00:00:00Z"),
      promoEndsAt: new Date("2026-10-10T00:00:00Z"),
    };
    expect(effectivePrice(promo, "monthly", now)).toEqual({
      amount: 700_000,
      regular: 900_000,
    });
    // No yearly promotion was set: the yearly price is unchanged.
    expect(effectivePrice(promo, "yearly", now)).toEqual({
      amount: 9_000_000,
      regular: null,
    });
  });

  it("ignores a promotion before it starts or after it ends", () => {
    const promo = { ...plan, promoMonthlyPrice: 700_000 };
    expect(
      effectivePrice(
        { ...promo, promoStartsAt: new Date("2026-10-04T00:00:00Z") },
        "monthly",
        now,
      ).amount,
    ).toBe(900_000);
    expect(
      effectivePrice(
        { ...promo, promoEndsAt: new Date("2026-10-02T00:00:00Z") },
        "monthly",
        now,
      ).amount,
    ).toBe(900_000);
    expect(promoActive(promo, now)).toBe(true);
  });

  it("never charges a 'promotion' above the regular price, or zero", () => {
    expect(
      effectivePrice({ ...plan, promoMonthlyPrice: 1_000_000 }, "monthly", now).amount,
    ).toBe(900_000);
    expect(effectivePrice({ ...plan, promoMonthlyPrice: 0 }, "monthly", now).amount).toBe(
      900_000,
    );
  });
});

describe("plan limits", () => {
  const live = {
    code: "tier-small",
    maxProducts: -1,
    maxCategories: -1,
    maxTables: 10,
    maxDailyViews: 300,
    allowsBranches: false,
    allowsOnlinePay: true,
    allowsAnalytics: true,
  };

  it("holds a subscriber to the limits they bought, not to later edits", () => {
    const bought = snapshotLimits(live);
    const edited = { ...live, maxTables: 5, allowsOnlinePay: false };
    expect(effectiveLimits(bought, edited).maxTables).toBe(10);
    expect(effectiveLimits(bought, edited).allowsOnlinePay).toBe(true);
  });

  it("falls back to the live plan without a snapshot, field by field", () => {
    expect(effectiveLimits(null, live)).toEqual(effectiveLimits({}, live));
    expect(effectiveLimits({ maxTables: "x" }, live).maxTables).toBe(10);
    expect(effectiveLimits({ maxTables: 25 }, live).maxTables).toBe(25);
  });
});
