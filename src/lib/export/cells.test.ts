import { describe, expect, it } from "vitest";
import { cellParts, normalisePersian } from "./cells";

describe("normalisePersian", () => {
  it("replaces Arabic yeh and kaf with the Persian letters", () => {
    expect(normalisePersian("كيك")).toBe("کیک");
    expect(normalisePersian("\u064A\u0643")).toBe("\u06CC\u06A9");
  });

  it("replaces alef maksura, the other look-alike final yeh", () => {
    expect(normalisePersian("مصطفى")).toBe("مصطفی");
  });

  /** The half-space is correct Persian spelling, not noise. */
  it("keeps the zero-width non-joiner", () => {
    expect(normalisePersian("م\u06CC\u200Cخواهم")).toBe("م\u06CC\u200Cخواهم");
  });

  it("leaves Persian, Latin and digits alone", () => {
    const text = "چیزبرگر ویژه — Burger 42 ۱۲";
    expect(normalisePersian(text)).toBe(text);
  });

  it("is idempotent", () => {
    const once = normalisePersian("شكر ي");
    expect(normalisePersian(once)).toBe(once);
  });
});

describe("cellParts", () => {
  it("gives a plain value its column's kind", () => {
    expect(cellParts(1200, "money")).toEqual({ value: 1200, kind: "money" });
  });

  it("gives a typed cell its own kind", () => {
    expect(cellParts({ value: 0.3, kind: "percent" }, "money")).toEqual({
      value: 0.3,
      kind: "percent",
    });
  });

  it("treats null as a plain empty value", () => {
    expect(cellParts(null, "money")).toEqual({ value: null, kind: "money" });
  });
});
