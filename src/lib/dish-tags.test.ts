import { describe, expect, it } from "vitest";
import {
  DISH_TAGS,
  DISH_TAG_ICONS,
  FILTERABLE_DISH_TAGS,
  hasDishTag,
  isDishTag,
  matchesDishFilters,
  normaliseDishTags,
} from "./dish-tags";

describe("dish tags", () => {
  it("has an icon for every tag", () => {
    for (const tag of DISH_TAGS) expect(DISH_TAG_ICONS[tag]).toBeTruthy();
  });

  it("only offers preference tags as filters, never warnings", () => {
    expect(FILTERABLE_DISH_TAGS).not.toContain("containsNuts");
    expect(FILTERABLE_DISH_TAGS).not.toContain("containsDairy");
    for (const tag of FILTERABLE_DISH_TAGS) expect(isDishTag(tag)).toBe(true);
  });

  it("recognises only known tags", () => {
    expect(isDishTag("spicy")).toBe(true);
    expect(isDishTag("Spicy")).toBe(false);
    expect(isDishTag("")).toBe(false);
    expect(isDishTag(null)).toBe(false);
    expect(isDishTag(3)).toBe(false);
  });

  it("normalises stored tags into canonical order without unknowns or duplicates", () => {
    expect(normaliseDishTags(["containsNuts", "spicy", "retired", "spicy"])).toEqual([
      "spicy",
      "containsNuts",
    ]);
    expect(normaliseDishTags(null)).toEqual([]);
    expect(normaliseDishTags(undefined)).toEqual([]);
    expect(normaliseDishTags([])).toEqual([]);
  });

  it("treats vegan as vegetarian, but not the other way round", () => {
    expect(hasDishTag(["vegan"], "vegetarian")).toBe(true);
    expect(hasDishTag(["vegetarian"], "vegan")).toBe(false);
    expect(hasDishTag(["spicy"], "vegetarian")).toBe(false);
  });

  it("requires every active filter", () => {
    expect(matchesDishFilters(["spicy", "vegan"], [])).toBe(true);
    expect(matchesDishFilters(["spicy", "vegan"], ["spicy", "vegetarian"])).toBe(true);
    expect(matchesDishFilters(["spicy"], ["spicy", "vegetarian"])).toBe(false);
    expect(matchesDishFilters([], ["glutenFree"])).toBe(false);
  });
});
