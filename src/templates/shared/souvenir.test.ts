import { describe, expect, it } from "vitest";
import { isSouvenirCategory, splitSouvenirs } from "./souvenir";
import type { MenuCategory } from "../types";

function category(name: string, nameEn: string | null = null): MenuCategory {
  return {
    id: name,
    name,
    nameEn,
    icon: null,
    iconUrl: null,
    imageUrl: null,
    products: [],
  };
}

describe("isSouvenirCategory", () => {
  it("matches the plain Persian word", () => {
    expect(isSouvenirCategory(category("سوغاتی"))).toBe(true);
    expect(isSouvenirCategory(category("سوغات"))).toBe(true);
  });

  it("matches when the name carries extra words", () => {
    expect(isSouvenirCategory(category("سوغاتی اصفهان"))).toBe(true);
    expect(isSouvenirCategory(category("بخش سوغات و یادگاری"))).toBe(true);
  });

  it("folds the Arabic ya and kaf an owner may have typed", () => {
    // "سوغاتي" with Arabic ي rather than Persian ی.
    expect(isSouvenirCategory(category("سوغاتي"))).toBe(true);
  });

  it("ignores a zero-width non-joiner inside the word", () => {
    expect(isSouvenirCategory(category("سوغاتی‌ها"))).toBe(true);
  });

  it("matches the English name when that is what is filled in", () => {
    expect(isSouvenirCategory(category("Gifts", "Gifts"))).toBe(true);
    expect(isSouvenirCategory(category("چیز", "Souvenirs"))).toBe(true);
    expect(isSouvenirCategory(category("SOUVENIR SHOP"))).toBe(true);
  });

  it("leaves ordinary food categories alone", () => {
    for (const name of ["پیش‌غذا", "نوشیدنی سرد", "دسر", "غذای اصلی", "Coffee"]) {
      expect(isSouvenirCategory(category(name))).toBe(false);
    }
  });
});

describe("splitSouvenirs", () => {
  it("moves souvenirs out of the food list", () => {
    const { food, souvenirs } = splitSouvenirs([
      category("پیش‌غذا"),
      category("سوغاتی"),
      category("دسر"),
    ]);

    expect(food.map((c) => c.name)).toEqual(["پیش‌غذا", "دسر"]);
    expect(souvenirs.map((c) => c.name)).toEqual(["سوغاتی"]);
  });

  it("keeps the owner's ordering inside each group", () => {
    const { food } = splitSouvenirs([
      category("دسر"),
      category("پیش‌غذا"),
      category("نوشیدنی"),
    ]);
    expect(food.map((c) => c.name)).toEqual(["دسر", "پیش‌غذا", "نوشیدنی"]);
  });

  it("returns an empty souvenir list for an ordinary menu", () => {
    const { food, souvenirs } = splitSouvenirs([category("دسر"), category("نوشیدنی")]);
    expect(souvenirs).toHaveLength(0);
    expect(food).toHaveLength(2);
  });

  it("handles an empty menu", () => {
    expect(splitSouvenirs([])).toEqual({ food: [], souvenirs: [] });
  });
});
