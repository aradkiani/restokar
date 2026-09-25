/**
 * Turning rows of business data into a file a spreadsheet will open correctly.
 *
 * Free of database and framework imports, like every other domain module here.
 * What is worth testing is the escaping, the encoding and the formula guard —
 * all three are decisions about whether an owner's file arrives intact or
 * corrupted, and none of them can be checked by looking at the happy path.
 *
 * ### Why CSV and not `.xlsx`
 *
 * A UTF-8 CSV with a byte-order mark opens directly in Excel with Persian text
 * intact and numeric columns still numeric, which is the whole of what an owner
 * needs to hand a file to their accountant. A real `.xlsx` writer would be the
 * first heavy dependency in a codebase that has deliberately avoided them — no
 * chart library, no state library, no UI kit — for marginal benefit over a
 * format every spreadsheet on earth already reads.
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

/**
 * What a cell may hold.
 *
 * Deliberately narrow. `Date` is absent: a date has to be rendered in the
 * venue's own timezone and calendar, which is a decision `datasets.ts` makes
 * with the platform's existing time helpers — accepting a `Date` here would
 * invite this module to invent a second answer.
 */
export type CsvValue = string | number | boolean | null | undefined;

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
 */
function formatCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  // Non-finite numbers have no spreadsheet representation; a blank is honest
  // where `NaN` or `Infinity` would be read as text and break the column.
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "boolean") return value ? "1" : "0";

  return guardFormula(value);
}

/** One row, already ordered to match the header. */
export type CsvRow = readonly CsvValue[];

/**
 * A complete CSV document, ready to be sent as a file.
 *
 * Returns a string rather than a Response so this stays testable without a
 * framework; the route wraps it.
 */
export function toCsv(headers: readonly string[], rows: readonly CsvRow[]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCell(formatCell(cell))).join(","),
  );

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
): string {
  const safeSlug = venueSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const parts = ["restokar", safeSlug || "venue", dataset, isoDate].filter(Boolean);

  return `${parts.join("-")}.csv`;
}
