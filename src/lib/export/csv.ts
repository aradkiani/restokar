import {
  cellParts,
  normalisePersian,
  type CellValue,
  type ColumnKind,
  type ExportRow,
} from "./cells";

/**
 * Turning rows of business data into a plain CSV file.
 *
 * Free of database and framework imports, like every other domain module here.
 * What is worth testing is the escaping, the encoding and the formula guard —
 * all three are decisions about whether an owner's file arrives intact or
 * corrupted, and none of them can be checked by looking at the happy path.
 *
 * ### The second format, not the default
 *
 * Owners download `.xlsx` (`xlsx.ts`). A CSV cannot carry direction, fonts or
 * number formats, and on a Windows set to the Persian format Excel expects `؛`
 * between fields, so a comma-separated file opens with every row in one column.
 * CSV stays for the other consumers — an accountant's import tool, a script —
 * which read commas and UTF-8 regardless of the machine's region.
 */

/** Windows line endings: Excel is the primary consumer and it prefers CRLF. */
const ROW_SEPARATOR = "\r\n";

/**
 * The byte-order mark, and the single most important character in this file.
 *
 * Without it Excel decodes a CSV using the machine's legacy codepage rather
 * than UTF-8, and every Persian product name arrives as mojibake — «چیزبرگر»
 * becomes «Ú†ÛŒØ²Ø¨Ø±Ú¯Ø±». The file is perfectly valid UTF-8 either way; Excel
 * simply does not look. Three bytes fix it, and no other spreadsheet minds.
 */
export const UTF8_BOM = "﻿";

/**
 * Characters that make Excel treat a cell as a formula rather than as text.
 *
 * A dish named `=SUM(A1:A9)` — or, far more plausibly, one an attacker names
 * `=HYPERLINK("http://…")` — is executed when the owner opens the file. This is
 * a real and long-standing spreadsheet injection class, and the data flowing
 * through here is user-controlled: product names, category names, customer
 * names and order notes all come from outside.
 *
 * Tab and carriage return are included because Excel strips leading whitespace
 * before deciding, so `\t=cmd` is still a formula.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutralises a cell that would otherwise be read as a formula.
 *
 * Prefixed with an apostrophe, which is the spreadsheet convention for "treat
 * the rest as literal text" — it is consumed on display, so the owner sees the
 * value they expect rather than a mangled one.
 *
 * Deliberately not applied to numbers. A negative figure is a legitimate value
 * that happens to start with `-`, and quoting it as text would break exactly
 * the arithmetic this export exists to enable. Only *strings* are guarded, and
 * `formatCell` below is what decides which is which.
 */
export function guardFormula(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_PREFIXES.includes(value[0]!) ? `'${value}` : value;
}

/**
 * One value, escaped for CSV.
 *
 * Quotes anything containing a delimiter, a quote or a newline, and doubles
 * embedded quotes — RFC 4180, which is what spreadsheets actually implement.
 */
function escapeCell(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  if (!needsQuotes) return value;

  return `"${value.replaceAll('"', '""')}"`;
}

/** What a cell may hold — the shared definition, see `cells.ts`. */
export type CsvValue = CellValue;

/**
 * A cell's final text.
 *
 * Numbers are written bare — no thousands separator, no currency symbol, no
 * Persian digits — because the point of exporting is that the spreadsheet can
 * add them up. «۱٬۲۵۰٬۰۰۰ تومان» is a string to Excel; `1250000` is money. The
 * unit belongs in the column *header*, which is where `datasets.ts` puts it.
 *
 * Null and undefined become empty rather than "null": a blank cell is what a
 * spreadsheet user reads as "no value", and it keeps a numeric column numeric
 * instead of poisoning it with text.
 *
 * Text is written with Persian letters in place of their Arabic look-alikes
 * (`normalisePersian`), so a filter on the column does not split one dish in
 * two. A phone number keeps its leading zero behind the same apostrophe guard.
 */
function formatCell(value: CsvValue, kind: ColumnKind): string {
  if (value === null || value === undefined) return "";

  // Non-finite numbers have no spreadsheet representation; a blank is honest
  // where `NaN` or `Infinity` would be read as text and break the column.
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "boolean") return value ? "1" : "0";

  /*
    `09121234567` read as a number loses its leading zero and cannot be dialled.
    Excel does this eagerly, so the value carries the text marker. In `.xlsx`
    the cell is typed as text instead and needs no marker.
  */
  if (kind === "phone" && value !== "") return `'${value}`;

  return guardFormula(normalisePersian(value));
}

/** One row, already ordered to match the header. */
export type CsvRow = ExportRow;

/**
 * A complete CSV document, ready to be sent as a file.
 *
 * Returns a string rather than a Response so this stays testable without a
 * framework; the route wraps it. `kinds` is optional because only a phone
 * column is written differently; without it every column is text.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly CsvRow[],
  kinds: readonly ColumnKind[] = [],
): string {
  const kindOf = (i: number): ColumnKind => kinds[i] ?? "text";

  const lines = [
    headers.map((header) => escapeCell(formatCell(header, "text"))).join(","),
    ...rows.map((row) =>
      row
        .map((cell, i) => {
          const { value, kind } = cellParts(cell, kindOf(i));
          return escapeCell(formatCell(value, kind));
        })
        .join(","),
    ),
  ];

  /*
    A trailing newline, which is what POSIX tools expect and what stops the last
    row being treated as an incomplete line by stricter parsers. Excel ignores
    it either way.
  */
  return UTF8_BOM + lines.join(ROW_SEPARATOR) + ROW_SEPARATOR;
}

// ------------------------------- file naming -------------------------------

/**
 * A filename that is predictable, sortable, and safe on every filesystem.
 *
 * Slugified rather than interpolated raw: a venue is named «کافه نبش», and a
 * Persian filename survives a modern OS but not every download path, email
 * gateway or accountant's Windows share. The venue is identified by its slug —
 * which the platform already uses as its public identifier — and the date makes
 * a folder of exports sort chronologically.
 *
 * Deliberately carries no customer name, no order id and no token: a filename
 * is the one part of a download that leaks into logs, chat apps and shared
 * folders.
 */
export function exportFilename(
  dataset: string,
  venueSlug: string,
  isoDate: string,
  extension: "csv" | "xlsx",
): string {
  const safeSlug = venueSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const parts = ["restokar", safeSlug || "venue", dataset, isoDate].filter(Boolean);

  return `${parts.join("-")}.${extension}`;
}
