import { describe, expect, it } from "vitest";
import {
  PlanEditSchema,
  describeChange,
  diffPlan,
  planState,
  touchesLimits,
  touchesPrice,
  type PlanState,
} from "./plan-edit";

const state: PlanState = {
  name: "کوچک",
  nameEn: "Small",
  description: null,
  descriptionEn: null,
  monthlyPrice: 599_000,
  yearlyPrice: 5_990_000,
  promoMonthlyPrice: null,
  promoYearlyPrice: null,
  promoStartsAt: null,
  promoEndsAt: null,
  maxProducts: -1,
  maxCategories: -1,
  maxTables: 10,
  maxDailyViews: 300,
  allowsOnlinePay: false,
  allowsAnalytics: true,
  allowsBranches: false,
  allowsCustomDomain: false,
  isPublic: true,
  isRecommended: false,
  sortOrder: 0,
  features: null,
};

const parse = (patch: Partial<PlanState>) =>
  PlanEditSchema.safeParse({ ...state, ...patch, expectedVersion: 0 });
const pathsOf = (patch: Partial<PlanState>) => {
  const result = parse(patch);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("plan edit rules", () => {
  it("accepts the current state of a plan", () => {
    expect(parse({}).success).toBe(true);
  });

  it("requires every field — a missing one is an error, never a default", () => {
    const rest: Record<string, unknown> = { ...state, expectedVersion: 0 };
    delete rest.monthlyPrice;
    expect(PlanEditSchema.safeParse(rest).success).toBe(false);
  });

  it("only lets a promotion lower the price", () => {
    expect(pathsOf({ promoMonthlyPrice: 599_000 })).toContain("promoMonthlyPrice");
    expect(pathsOf({ promoYearlyPrice: 6_000_000 })).toContain("promoYearlyPrice");
    expect(pathsOf({ promoMonthlyPrice: 499_000 })).toEqual([]);
  });

  it("checks the promotion window", () => {
    expect(
      pathsOf({
        promoMonthlyPrice: 499_000,
        promoStartsAt: "2026-10-10T00:00:00.000Z",
        promoEndsAt: "2026-10-01T00:00:00.000Z",
      }),
    ).toContain("promoEndsAt");
    expect(pathsOf({ promoStartsAt: "2026-10-10T00:00:00.000Z" })).toContain(
      "promoMonthlyPrice",
    );
  });

  it("refuses negative prices and a hidden recommended plan", () => {
    expect(pathsOf({ monthlyPrice: -1 })).toContain("monthlyPrice");
    expect(pathsOf({ isPublic: false, isRecommended: true })).toContain("isRecommended");
  });

  it("lists what changed and classifies it", () => {
    const changes = diffPlan(state, { ...state, monthlyPrice: 649_000, maxTables: 12 });
    expect(changes.map((c) => c.field)).toEqual(["monthlyPrice", "maxTables"]);
    expect(touchesPrice(changes)).toBe(true);
    expect(touchesLimits(changes)).toBe(true);
    expect(describeChange(changes[0]!)).toBe("قیمت ماهانه: ۵۹۹٬۰۰۰ ← ۶۴۹٬۰۰۰");
    expect(describeChange({ ...changes[1]!, after: -1 })).toBe("سقف میز: ۱۰ ← نامحدود");
    expect(diffPlan(state, { ...state })).toEqual([]);
  });

  it("reads a plan row into the editable state", () => {
    const row = {
      ...state,
      promoStartsAt: new Date("2026-10-01T00:00:00Z"),
      promoEndsAt: null,
      features: [{ fa: "الف", en: 3 }],
    };
    const result = planState(row);
    expect(result.promoStartsAt).toBe("2026-10-01T00:00:00.000Z");
    expect(result.features).toEqual([{ fa: "الف", en: "" }]);
  });
});
