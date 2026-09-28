import type { CellValue, ColumnKind } from "./cells";

/**
 * How every exported spreadsheet looks. The one place to change it.
 *
 * Every export goes through `xlsx.ts`, and `xlsx.ts` takes all of its visual
 * decisions from here: the font, the colours, the alignment, the number formats,
 * how wide a column is and how tall a row is. Nothing in a dataset or in the
 * route decides any of it, so a sales file and a customer file cannot drift
 * apart in appearance.
 *
 * Pure: no imports beyond types, so the measuring rules are tested directly.
 */

// ---------------------------------- font -----------------------------------

/**
 * Tahoma, everywhere.
 *
 * It ships with Windows and macOS, carries a complete Persian glyph set, and
 * keeps Persian and Latin digits the same height. Excel's own default (Calibri
 * or Aptos) has no Persian glyphs, so Persian text falls back to whatever the
 * machine has and a single file ends up in two or three fonts.
 */
export const SHEET_FONT = { name: "Tahoma", size: 10 } as const;

// --------------------------------- colours ---------------------------------

/** ARGB, as the file format wants them. Quiet greys and one dark header. */
export const SHEET_COLORS = {
  headerFill: "FF334155",
  headerText: "FFFFFFFF",
  headerBorder: "FF1E293B",
  gridBorder: "FFD5DBE3",
  /** Every second data row. Applied as a rule, so it survives sort and filter. */
  zebraFill: "FFF3F5F8",
} as const;

// -------------------------------- alignment --------------------------------

/**
 * Right-aligned, vertically centred, read right to left — every cell.
 *
 * `readingOrder` 2 is right-to-left. Without it a cell that *starts* with a
 * Latin word or a number («Pizza پیتزا», «2 عدد») is laid out left to right and
 * its punctuation lands on the wrong end.
 */
export const CELL_ALIGNMENT = {
  horizontal: "right",
  vertical: "center",
  readingOrder: 2,
} as const;

// ------------------------------ number formats -----------------------------

/**
 * The Excel number format for each kind.
 *
 * The `,` and `.` here are placeholders, not literal characters: Excel swaps in
 * the reader's own thousands and decimal separators, so an owner on a Persian
 * Windows sees their usual `/` decimal point. Negative money is red, because
 * the one negative figure an owner meets is a net loss.
 *
 * `@` marks a cell as text, so an owner who edits a phone number later does not
 * have Excel strip its leading zero.
 */
export const NUMBER_FORMATS: Readonly<Record<ColumnKind, string>> = {
  text: "@",
  id: "0",
  integer: "#,##0",
  money: "#,##0;[Red]-#,##0",
  percent: "0.0%",
  ratio: "0.00",
  quantity: "General",
  date: "yyyy/mm/dd",
  time: "hh:mm",
  phone: "@",
};

// -------------------------------- geometry ---------------------------------

/** Points. One height for every data row that fits on one line. */
export const ROW_HEIGHTS = {
  header: 30,
  body: 21,
  /** Per extra line of a wrapped cell. */
  line: 15,
  /** A wrapped cell stops growing here; the rest is one click away. */
  maxLines: 6,
} as const;

/** Column widths, in Excel's "characters of the default font" unit. */
export const COLUMN_WIDTHS = {
  min: 8,
  /** Text wider than this wraps instead of widening the column. */
  maxText: 45,
  /** Breathing room either side of the longest value. */
  padding: 2.5,
  /** The autofilter button sits inside the header cell and hides text under it. */
  filterButton: 2.5,
} as const;

/**
 * How much wider Tahoma is than Excel's width unit assumes.
 *
 * The unit is the width of a digit in the workbook's default font. Tahoma runs a
 * little wider than that, and bold wider again; without this factor a column
 * sized to its longest name clips the last letter.
 */
const TAHOMA_FACTOR = 1.1;
const BOLD_FACTOR = 1.15;

/** Digits plus the separators `#,##0` adds. */
function groupedLength(value: number): number {
  const digits = String(Math.round(Math.abs(value))).length;
  return digits + Math.floor((digits - 1) / 3) + (value < 0 ? 1 : 0);
}

/**
 * Roughly how many characters a value takes once Excel has formatted it.
 *
 * An estimate, and deliberately so: the real width depends on glyphs Excel
 * measures at render time. It only has to be close enough that nothing clips
 * and nothing sprawls.
 */
export function displayLength(value: CellValue, kind: ColumnKind): number {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    switch (kind) {
      case "money":
      case "integer":
        return groupedLength(value);
      case "percent":
        return (value * 100).toFixed(1).length + 1;
      case "ratio":
        return value.toFixed(2).length;
      case "date":
        return 10;
      case "time":
        return 5;
      default:
        return String(value).length;
    }
  }

  if (typeof value === "boolean") return 5;
  if (kind === "date") return 10;
  if (kind === "time") return 5;

  // Code points, not UTF-16 units: an emoji is one character on screen.
  return [...value].length * TAHOMA_FACTOR;
}

export interface ColumnLayout {
  width: number;
  /** Whether long text in this column wraps onto more lines. */
  wrap: boolean;
}

/**
 * A column's width from its header and its longest value.
 *
 * Numbers and dates never wrap, so their column simply fits them. Text is
 * capped at `maxText` and wraps beyond it; a notes column would otherwise be
 * two screens wide.
 */
export function columnLayout(
  header: string,
  kind: ColumnKind,
  longestValue: number,
): ColumnLayout {
  const headerNeed =
    [...header].length * TAHOMA_FACTOR * BOLD_FACTOR + COLUMN_WIDTHS.filterButton;
  const valueNeed = longestValue;

  const isText = kind === "text";
  const wrap = isText && valueNeed + COLUMN_WIDTHS.padding > COLUMN_WIDTHS.maxText;

  const natural = Math.max(headerNeed, valueNeed) + COLUMN_WIDTHS.padding;
  const capped = isText
    ? Math.min(natural, Math.max(COLUMN_WIDTHS.maxText, headerNeed))
    : natural;
  const width = Math.max(COLUMN_WIDTHS.min, capped);

  return { width: Math.round(width * 10) / 10, wrap };
}

/**
 * A data row's height, given how many lines its tallest wrapped cell needs.
 *
 * Explicit rather than left to Excel: a row with a stored height is never
 * auto-fitted, and a row without one is auto-fitted only by some spreadsheet
 * programs. Writing the height makes every row the same everywhere.
 */
export function rowHeight(lines: number): number {
  const count = Math.min(Math.max(1, Math.ceil(lines)), ROW_HEIGHTS.maxLines);
  return count === 1
    ? ROW_HEIGHTS.body
    : ROW_HEIGHTS.body + (count - 1) * ROW_HEIGHTS.line;
}

/** How many lines a wrapped value needs in a column of this width. */
export function linesNeeded(length: number, width: number): number {
  const usable = Math.max(1, width - COLUMN_WIDTHS.padding);
  return Math.max(1, Math.ceil(length / usable));
}
