import { describe, expect, it } from "vitest";
import { fa } from "./i18n/fa";
import { builtInFeatures, parseFeatures, planFeatures, planLines } from "./plan-features";

describe("plan card lines", () => {
  it("keeps the lists the pricing page always showed, now keyed by plan", () => {
    expect(builtInFeatures("tier-small").map((f) => f.fa)).toEqual([
      fa.subscription.unlimitedMenu,
      fa.features.qrTitle,
      fa.features.kitchenTitle,
      fa.dashboard.analytics,
    ]);
    expect(builtInFeatures("tier-chain")).toHaveLength(5);
    // A custom domain is not built, so no plan may advertise one.
    for (const code of ["tier-small", "tier-medium", "tier-large", "tier-chain"]) {
      expect(builtInFeatures(code).map((line) => line.fa)).not.toContain(
        fa.subscription.customDomain,
      );
    }
    expect(builtInFeatures("retired-plan")).toEqual([]);
  });

  it("uses the admin's list when one is saved, and the built-in one otherwise", () => {
    const custom = [{ fa: "پشتیبانی تلفنی", en: "Phone support" }];
    expect(planFeatures({ code: "tier-small", features: custom })).toEqual(custom);
    expect(planFeatures({ code: "tier-small", features: null })).toEqual(
      builtInFeatures("tier-small"),
    );
    // An admin who emptied the list gets an empty list, not the defaults.
    expect(planFeatures({ code: "tier-small", features: [] })).toEqual([]);
  });

  it("ignores a malformed stored list", () => {
    expect(parseFeatures("nope")).toBeNull();
    expect(parseFeatures([null])).toBeNull();
    expect(parseFeatures([{ fa: "", en: "x" }])).toEqual([]);
  });

  it("puts the two priced limits first, and none on a contract tier", () => {
    const base = { code: "tier-small", features: null, maxTables: 10, maxDailyViews: -1 };
    const lines = planLines({ ...base, isContractPriced: false }, fa, "fa");
    expect(lines[0]).toBe(`۱۰ ${fa.subscription.limitTables}`);
    expect(lines[1]).toBe(
      `${fa.subscription.unlimited} ${fa.subscription.limitDailyViews}`,
    );
    expect(planLines({ ...base, isContractPriced: true }, fa, "fa")).toEqual(
      builtInFeatures("tier-small").map((f) => f.fa),
    );
  });
});
