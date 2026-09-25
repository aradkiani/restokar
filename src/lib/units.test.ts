import { describe, expect, it } from "vitest";
import {
  compatibleUnits,
  convert,
  dimensionOf,
  fromItemMilli,
  isUnitCode,
  legacyUnitCode,
  toItemMilli,
  UNIT_CODES,
} from "./units";

describe("the catalogue", () => {
  it("covers weight, volume and count", () => {
    expect(dimensionOf("kg")).toBe("weight");
    expect(dimensionOf("l")).toBe("volume");
    expect(dimensionOf("piece")).toBe("count");
  });

  /** Must match the CHECK constraint in the migration, or writes will fail. */
  it("holds exactly the codes the database accepts", () => {
    expect([...UNIT_CODES].sort()).toEqual(
      ["dozen", "g", "kg", "l", "mesghal", "ml", "piece", "tbsp", "tsp"].sort(),
    );
  });

  it("offers only same-kind units as alternatives", () => {
    expect(compatibleUnits("kg").sort()).toEqual(["g", "kg", "mesghal"]);
    expect(compatibleUnits("ml").sort()).toEqual(["l", "ml", "tbsp", "tsp"]);
    expect(compatibleUnits("piece").sort()).toEqual(["dozen", "piece"]);
  });

  it("rejects anything that is not a code", () => {
    expect(isUnitCode("kg")).toBe(true);
    expect(isUnitCode("کیلوگرم")).toBe(false);
    expect(isUnitCode("toString")).toBe(false);
    expect(isUnitCode(undefined)).toBe(false);
  });
});

describe("convert", () => {
  it("converts within a dimension", () => {
    expect(convert(230, "g", "kg")).toBeCloseTo(0.23, 10);
    expect(convert(2, "kg", "g")).toBe(2_000);
    expect(convert(1, "l", "ml")).toBe(1_000);
    expect(convert(2, "dozen", "piece")).toBe(24);
    expect(convert(1, "tbsp", "tsp")).toBe(3);
  });

  it("knows a mesghal is 4.608 grams", () => {
    expect(convert(1, "mesghal", "g")).toBeCloseTo(4.608, 10);
  });

  /** "230 grams of a litre" is a mistake to refuse, not a number to invent. */
  it("refuses to convert across dimensions", () => {
    expect(convert(230, "g", "l")).toBeNull();
    expect(convert(1, "piece", "kg")).toBeNull();
  });
});

describe("toItemMilli — a recipe amount as stored", () => {
  /** The user's own example: 230 g of flour kept in kilograms. */
  it("stores 230 g of a kilogram item as 230 thousandths of a kilogram", () => {
    expect(toItemMilli(230, "g", "kg")).toBe(230);
  });

  it("stores an amount in the item's own unit unchanged", () => {
    expect(toItemMilli(1.5, "kg", "kg")).toBe(1_500);
    expect(toItemMilli(0.5, "piece", "piece")).toBe(500);
  });

  it("stores a spoon of oil kept in litres", () => {
    expect(toItemMilli(1, "tbsp", "l")).toBe(15);
  });

  /**
   * 0.2 g of a kilogram item is 0.2 thousandths — below the resolution. Storing
   * zero would cost and deduct nothing while the owner believes it does.
   */
  it("refuses an amount too small to register at the item's resolution", () => {
    expect(toItemMilli(0.2, "g", "kg")).toBeNull();
    expect(toItemMilli(0.2, "g", "g")).toBe(200);
  });

  it("refuses incompatible units, zero and nonsense", () => {
    expect(toItemMilli(230, "g", "l")).toBeNull();
    expect(toItemMilli(0, "g", "kg")).toBeNull();
    expect(toItemMilli(-5, "g", "kg")).toBeNull();
    expect(toItemMilli(Number.NaN, "g", "kg")).toBeNull();
  });

  it("reads a stored amount back in the unit it was typed in", () => {
    expect(fromItemMilli(230, "kg", "g")).toBeCloseTo(230, 10);
  });
});

describe("legacyUnitCode", () => {
  it("maps the labels the old free-text field suggested", () => {
    expect(legacyUnitCode("کیلوگرم")).toBe("kg");
    expect(legacyUnitCode(" گرم ")).toBe("g");
    expect(legacyUnitCode("لیتر")).toBe("l");
    expect(legacyUnitCode("عدد")).toBe("piece");
  });

  it("passes a code through untouched", () => {
    expect(legacyUnitCode("mesghal")).toBe("mesghal");
  });

  /** A count never invents a weight or volume the owner did not state. */
  it("reads anything unrecognised as a count", () => {
    expect(legacyUnitCode("بسته")).toBe("piece");
    expect(legacyUnitCode("")).toBe("piece");
  });
});
