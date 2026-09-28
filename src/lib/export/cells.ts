/**
 * What an export cell holds, shared by the CSV and the Excel writers.
 *
 * A dataset states the *kind* of each column — money, a percentage, a date — and
 * never how to draw it. The Excel writer turns a kind into a number format and a
 * width (`sheet-style.ts`); the CSV writer mostly ignores it. Keeping the
 * vocabulary here, away from both, is what lets one dataset feed two formats
 * without either one guessing from the header text.
 *
 * Pure: no imports at all.
 */

export const COLUMN_KINDS = [
  /** Free text: names, labels, notes. Wraps when it is too long for its column. */
  "text",
  /** A number that identifies rather than measures — an order number. No separators. */
  "id",
  /** A count. */
  "integer",
  /** Whole Toman. The unit is in the header, never in the cell. */
  "money",
  /** A fraction (0.25), shown as a percentage (25.0%). */
  "percent",
  /** A plain ratio that may exceed 1 — orders per menu visit. */
  "ratio",
  /** A stock quantity in the item's own unit; may carry decimals. */
  "quantity",
  /** `2026-09-15`, already in the venue's timezone. */
  "date",
  /** `21:45`, already in the venue's timezone. */
  "time",
  /** A phone number: text, so the leading zero survives. */
  "phone",
] as const;

export type ColumnKind = (typeof COLUMN_KINDS)[number];

export interface ExportColumn {
  header: string;
  kind: ColumnKind;
}

/**
 * A raw value.
 *
 * `Date` is absent on purpose: a date has to be rendered in the venue's own
 * timezone, which `datasets.ts` does with the platform's time helpers before it
 * gets here. Accepting a `Date` would invite a writer to invent a second answer.
 */
export type CellValue = string | number | boolean | null | undefined;

/**
 * A cell whose kind differs from its column's.
 *
 * The profit-and-loss export is the one user: a two-column list of labelled
 * amounts in Toman, with one line — the margin — that is a percentage.
 */
export interface TypedCell {
  value: CellValue;
  kind: ColumnKind;
}

export type ExportCell = CellValue | TypedCell;

/** One row, already ordered to match the columns. */
export type ExportRow = readonly ExportCell[];

function isTypedCell(cell: ExportCell): cell is TypedCell {
  return typeof cell === "object" && cell !== null;
}

/** The value and the kind a writer should use for one cell. */
export function cellParts(
  cell: ExportCell,
  columnKind: ColumnKind,
): { value: CellValue; kind: ColumnKind } {
  return isTypedCell(cell)
    ? { value: cell.value, kind: cell.kind }
    : { value: cell, kind: columnKind };
}

// ------------------------------ Persian text -------------------------------

/**
 * Arabic code points that look like Persian letters and are not.
 *
 * An owner typing on an Arabic keyboard layout, or pasting from an Arabic
 * source, produces `ي` (U+064A) and `ك` (U+0643) where Persian uses `ی` (U+06CC)
 * and `ک` (U+06A9). They render almost identically, which is exactly the
 * problem: «کیک» and «كيك» look the same on screen and are different strings to
 * a spreadsheet, so a filter, a sort or a pivot on the column splits one dish
 * into two. `ى` (U+0649, alef maksura) is the same case for a final yeh.
 */
const ARABIC_TO_PERSIAN: Readonly<Record<string, string>> = {
  "\u064A": "\u06CC",
  "\u0649": "\u06CC",
  "\u0643": "\u06A9",
};

const ARABIC_LOOKALIKES = /[\u064A\u0649\u0643]/g;

/**
 * Persian letters in place of their Arabic look-alikes.
 *
 * Deliberately nothing more. No reshaping and no bidi reordering: Excel shapes
 * and orders Arabic-script text itself, and pre-shaped presentation forms are
 * what produce the disconnected, reversed letters people blame on "encoding".
 * The zero-width non-joiner (U+200C, the نیم‌فاصله) is part of correct Persian
 * spelling and passes through untouched.
 */
export function normalisePersian(text: string): string {
  return text.replace(ARABIC_LOOKALIKES, (char) => ARABIC_TO_PERSIAN[char] ?? char);
}
