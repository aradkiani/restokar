import { describe, expect, it } from "vitest";
import {
  COLUMN_WIDTHS,
  columnLayout,
  displayLength,
  linesNeeded,
  NUMBER_FORMATS,
  ROW_HEIGHTS,
  rowHeight,
  SHEET_FONT,
} from "./sheet-style";

describe("the shared look", () => {
  it("uses Tahoma, which carries Persian on Windows and macOS", () => {
    expect(SHEET_FONT.name).toBe("Tahoma");
  });

  it("formats money with thousands separators and a red loss", () => {
    expect(NUMBER_FORMATS.money).toBe("#,##0;[Red]-#,##0");
  });

  it("formats shares as percentages and dates as dates", () => {
    expect(NUMBER_FORMATS.percent).toBe("0.0%");
    expect(NUMBER_FORMATS.date).toBe("yyyy/mm/dd");
    expect(NUMBER_FORMATS.time).toBe("hh:mm");
  });

  /** A phone edited later must not lose its leading zero. */
  it("marks phone and text columns as text", () => {
    expect(NUMBER_FORMATS.phone).toBe("@");
    expect(NUMBER_FORMATS.text).toBe("@");
  });
});

describe("displayLength", () => {
  it("counts the separators a money format adds", () => {
    expect(displayLength(1_250_000, "money")).toBe("1,250,000".length);
    expect(displayLength(-50_000, "money")).toBe("-50,000".length);
  });

  it("measures a fraction as the percentage it displays", () => {
    expect(displayLength(0.4821, "percent")).toBe("48.2%".length);
  });

  it("measures dates and times at their formatted width", () => {
    expect(displayLength("2026-09-15", "date")).toBe(10);
    expect(displayLength("21:45", "time")).toBe(5);
  });

  it("counts an emoji as one character", () => {
    expect(displayLength("😀", "text")).toBeLessThan(2);
  });

  it("gives an empty value no width", () => {
    expect(displayLength(null, "text")).toBe(0);
    expect(displayLength("", "text")).toBe(0);
    expect(displayLength(NaN, "money")).toBe(0);
  });
});

describe("columnLayout", () => {
  it("never goes below the minimum width", () => {
    expect(columnLayout("#", "id", 2).width).toBe(COLUMN_WIDTHS.min);
  });

  it("fits the header, filter button included", () => {
    const header = "میانگین هر سفارش (تومان)";
    const { width } = columnLayout(header, "money", 7);
    expect(width).toBeGreaterThan([...header].length);
  });

  it("wraps long text instead of widening past the cap", () => {
    const layout = columnLayout("یادداشت", "text", 120);
    expect(layout.wrap).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(COLUMN_WIDTHS.maxText);
  });

  it("never wraps a number", () => {
    expect(columnLayout("مبلغ", "money", 120).wrap).toBe(false);
  });
});

describe("row heights", () => {
  it("gives every single-line row the same height", () => {
    expect(rowHeight(1)).toBe(ROW_HEIGHTS.body);
  });

  it("grows by a line per wrapped line, up to a cap", () => {
    expect(rowHeight(3)).toBe(ROW_HEIGHTS.body + 2 * ROW_HEIGHTS.line);
    expect(rowHeight(50)).toBe(rowHeight(ROW_HEIGHTS.maxLines));
  });

  it("counts the lines a value needs in its column", () => {
    expect(linesNeeded(10, 45)).toBe(1);
    expect(linesNeeded(100, 45)).toBeGreaterThan(2);
  });
});
