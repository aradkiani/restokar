import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  caretAfterDigits,
  countDigits,
  formatMoney,
  formatMoneyInput,
  parseAmount,
} from "./format";

describe("formatMoney", () => {
  it("groups Toman in threes, in the reader's digits", () => {
    expect(formatMoney(1_250_000, "en")).toBe("1,250,000");
    expect(formatMoney(1_250_000, "fa")).toBe("۱٬۲۵۰٬۰۰۰");
  });

  it("is read back as the same number", () => {
    expect(parseAmount(formatMoney(1_250_000, "fa"))).toBe(1_250_000);
  });
});

describe("formatMoneyInput", () => {
  it("groups what is typed and keeps the bare number", () => {
    expect(formatMoneyInput("1250000", "en")).toEqual({
      text: "1,250,000",
      value: 1_250_000,
    });
    expect(formatMoneyInput("۱۲۵۰۰۰۰", "fa")).toEqual({
      text: "۱٬۲۵۰٬۰۰۰",
      value: 1_250_000,
    });
  });

  it("accepts Arabic digits and ignores separators the person typed", () => {
    expect(formatMoneyInput("١٬٢٥٠", "en").value).toBe(1_250);
    expect(formatMoneyInput("1,2,5,0", "en").value).toBe(1_250);
  });

  it("is empty with no value when nothing numeric was typed", () => {
    expect(formatMoneyInput("", "fa")).toEqual({ text: "", value: null });
    expect(formatMoneyInput("abc", "fa")).toEqual({ text: "", value: null });
  });

  it("drops leading zeros", () => {
    expect(formatMoneyInput("0005000", "en")).toEqual({ text: "5,000", value: 5_000 });
  });

  it("refuses a minus sign unless the field allows one", () => {
    expect(formatMoneyInput("-20000", "en").value).toBe(20_000);
    expect(formatMoneyInput("-20000", "en", true)).toEqual({
      text: "-20,000",
      value: -20_000,
    });
  });

  it("keeps a lone minus so a negative amount can be typed from its first key", () => {
    expect(formatMoneyInput("-", "fa", true)).toEqual({ text: "-", value: null });
  });

  it("caps the digits so the value stays exact", () => {
    expect(String(formatMoneyInput("9".repeat(30), "en").value)).toHaveLength(15);
  });
});

describe("caret placement", () => {
  it("counts digits in every script", () => {
    expect(countDigits("۱٬۲۵۰")).toBe(4);
    expect(countDigits("1,250")).toBe(4);
    expect(countDigits("-")).toBe(0);
  });

  /** Typing a digit into the middle of «1,250,000» must not jump to the end. */
  it("returns the caret to just after the same digit", () => {
    const { text } = formatMoneyInput("12550000", "en"); // "12,550,000"
    expect(caretAfterDigits(text, 3)).toBe("12,5".length);
  });

  it("puts the caret after a minus sign when no digit precedes it", () => {
    expect(caretAfterDigits("-5,000", 0)).toBe(1);
    expect(caretAfterDigits("5,000", 0)).toBe(0);
  });
});

/**
 * Every number on screen is formatted by this file. A component that builds
 * its own `Intl.NumberFormat` is where prices start to disagree — which is how
 * eight copies of one formatter had accumulated across the templates.
 */
describe("one formatter", () => {
  const src = fileURLToPath(new URL("..", import.meta.url));

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "generated" ? [] : sources(path);
      return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
    });
  }

  it("builds Intl.NumberFormat nowhere but lib/format.ts", () => {
    const offenders = sources(src)
      .filter((path) => !path.endsWith(join("lib", "format.ts")))
      .filter((path) => readFileSync(path, "utf8").includes("new Intl.NumberFormat"))
      .map((path) => relative(src, path));

    expect(offenders).toEqual([]);
  });
});
