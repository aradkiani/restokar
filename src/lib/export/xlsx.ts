import {
  cellParts,
  COLUMN_KINDS,
  normalisePersian,
  type CellValue,
  type ColumnKind,
  type ExportColumn,
  type ExportRow,
} from "./cells";
import {
  CELL_ALIGNMENT,
  columnLayout,
  displayLength,
  linesNeeded,
  NUMBER_FORMATS,
  ROW_HEIGHTS,
  rowHeight,
  SHEET_COLORS,
  SHEET_FONT,
  type ColumnLayout,
} from "./sheet-style";
import { zip } from "./zip";

/**
 * A real Excel workbook, written by hand.
 *
 * ### Why `.xlsx` and not only CSV
 *
 * A CSV has no direction, no font, no widths and no number formats, so Excel
 * chooses all of them — and on a Windows set to the Persian (fa-IR) format it
 * also chooses the delimiter, which there is `؛` rather than a comma. Every row
 * of a comma-separated file then lands in column A as one long string. That is
 * the "messy file" an Iranian owner meets, and no CSV setting fixes it: a
 * `sep=` line repairs the delimiter and breaks the byte-order mark that keeps
 * the Persian readable.
 *
 * ### Why by hand
 *
 * An `.xlsx` file is a zip of a handful of XML documents. The subset an export
 * needs — one sheet, inline strings, a fixed set of styles — is a few hundred
 * lines, against a dependency tree the rest of the codebase has deliberately
 * avoided. Every visual decision lives in `sheet-style.ts`; this file only
 * turns those decisions into the file format.
 *
 * ### Safety
 *
 * Text is written as an inline string, never as a formula, so a dish named
 * `=HYPERLINK(…)` is inert here without the apostrophe the CSV writer needs.
 * Characters XML cannot carry are dropped, and text is capped at Excel's own
 * per-cell limit, so user input cannot produce a file Excel refuses to open.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface XlsxSheet {
  /** The tab name. Cleaned and shortened to what Excel accepts. */
  name: string;
  columns: readonly ExportColumn[];
  rows: readonly ExportRow[];
  /** Stamped into the file's properties and the zip entries. */
  created?: Date;
}

// ---------------------------------- text -----------------------------------

/** Characters XML 1.0 cannot carry at all. Tab, newline and return are fine. */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Excel's hard limit per cell; longer text makes it refuse the file. */
const MAX_CELL_TEXT = 32_767;

function escapeText(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/** What a cell's text will be: Persian letters, within Excel's limit. */
function cellText(value: string): string {
  const text = normalisePersian(value);
  return text.length > MAX_CELL_TEXT ? text.slice(0, MAX_CELL_TEXT) : text;
}

// --------------------------------- styles ----------------------------------

/**
 * Excel's built-in format ids. Anything else is declared in the file from 164.
 */
const BUILTIN_FORMATS: Readonly<Record<string, number>> = {
  General: 0,
  "0": 1,
  "0.00": 2,
  "#,##0": 3,
  "@": 49,
};

const CUSTOM_FORMATS = [...new Set(Object.values(NUMBER_FORMATS))].filter(
  (code) => !(code in BUILTIN_FORMATS),
);

function formatId(code: string): number {
  return BUILTIN_FORMATS[code] ?? 164 + CUSTOM_FORMATS.indexOf(code);
}

/** Index 0 is the workbook default; 1 is the header; body styles follow. */
const HEADER_STYLE = 1;

/**
 * The style index for a body cell.
 *
 * The table is fixed — every kind, wrapped and not — rather than built from what
 * a sheet happens to use, so `styles.xml` is a constant and a style index means
 * the same thing in every file.
 */
function bodyStyle(kind: ColumnKind, wrap: boolean): number {
  return 2 + COLUMN_KINDS.indexOf(kind) * 2 + (wrap ? 1 : 0);
}

function alignmentXml(wrap: boolean): string {
  const { horizontal, vertical, readingOrder } = CELL_ALIGNMENT;
  return (
    `<alignment horizontal="${horizontal}" vertical="${vertical}" ` +
    `readingOrder="${readingOrder}"${wrap ? ' wrapText="1"' : ""}/>`
  );
}

function xf(
  numFmt: number,
  font: number,
  fill: number,
  border: number,
  wrap: boolean,
): string {
  return (
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" ` +
    `applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
    `${alignmentXml(wrap)}</xf>`
  );
}

function side(name: string, color: string): string {
  return `<${name} style="thin"><color rgb="${color}"/></${name}>`;
}

function border(color: string): string {
  return `<border>${["left", "right", "top", "bottom"].map((s) => side(s, color)).join("")}<diagonal/></border>`;
}

const STYLES_XML = (() => {
  const font = (bold: boolean, color?: string) =>
    `<font>${bold ? "<b/>" : ""}<sz val="${SHEET_FONT.size}"/>` +
    `${color ? `<color rgb="${color}"/>` : '<color theme="1"/>'}` +
    `<name val="${SHEET_FONT.name}"/><family val="2"/><charset val="178"/></font>`;

  const bodyXfs = COLUMN_KINDS.flatMap((kind) =>
    [false, true].map((wrap) => xf(formatId(NUMBER_FORMATS[kind]), 0, 0, 1, wrap)),
  );

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${CUSTOM_FORMATS.length}">` +
    CUSTOM_FORMATS.map(
      (code) => `<numFmt numFmtId="${formatId(code)}" formatCode="${escapeAttr(code)}"/>`,
    ).join("") +
    "</numFmts>" +
    `<fonts count="2">${font(false)}${font(true, SHEET_COLORS.headerText)}</fonts>` +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    `<fill><patternFill patternType="solid"><fgColor rgb="${SHEET_COLORS.headerFill}"/>` +
    '<bgColor indexed="64"/></patternFill></fill></fills>' +
    `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>` +
    `${border(SHEET_COLORS.gridBorder)}${border(SHEET_COLORS.headerBorder)}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${2 + bodyXfs.length}">` +
    xf(0, 0, 0, 0, false) +
    xf(BUILTIN_FORMATS["@"]!, 1, 2, 2, true) +
    bodyXfs.join("") +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    // The zebra stripe, applied by a conditional-format rule below.
    `<dxfs count="1"><dxf><fill><patternFill patternType="solid">` +
    `<bgColor rgb="${SHEET_COLORS.zebraFill}"/></patternFill></fill></dxf></dxfs>` +
    '<tableStyles count="0"/>' +
    "</styleSheet>"
  );
})();

// ------------------------------ dates and times ----------------------------

const DAY_MS = 86_400_000;

/** Excel's day zero. Its 1900 leap-year bug only affects dates before March 1900. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** `2026-09-15` → Excel's day number, or null when the text is not a date. */
export function excelDate(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;

  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const instant = Date.UTC(y, m - 1, d);
  const check = new Date(instant);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;

  return (instant - EXCEL_EPOCH) / DAY_MS;
}

/** `21:45` → Excel's fraction of a day, or null when the text is not a time. */
export function excelTime(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return (hours * 60 + minutes) / 1440;
}

// --------------------------------- cells -----------------------------------

/** Digits with no leading zero, short enough to stay exact as a double. */
const PLAIN_INTEGER = /^[1-9]\d{0,14}$/;

/** `A`, `B`, … `Z`, `AA` — Excel's column letters for a 0-based index. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function textCell(ref: string, style: number, value: string): string {
  return (
    `<c r="${ref}" s="${style}" t="inlineStr">` +
    `<is><t xml:space="preserve">${escapeText(cellText(value))}</t></is></c>`
  );
}

function numberCell(ref: string, style: number, value: number): string {
  return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
}

/**
 * One cell, typed by its kind.
 *
 * An empty value still writes a styled cell, so the grid lines and the zebra
 * stripe run unbroken across blanks.
 */
function cellXml(ref: string, style: number, value: CellValue, kind: ColumnKind): string {
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}" s="${style}"/>`;
  }

  if (typeof value === "boolean") {
    return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<c r="${ref}" s="${style}"/>`;
    return kind === "text" || kind === "phone"
      ? textCell(ref, style, String(value))
      : numberCell(ref, style, value);
  }

  if (kind === "date") {
    const serial = excelDate(value);
    if (serial !== null) return numberCell(ref, style, serial);
  }

  if (kind === "time") {
    const serial = excelTime(value);
    if (serial !== null) return numberCell(ref, style, serial);
  }

  /*
    An identifier that is a plain number — table «4» — is written as one, so the
    column sorts 1, 2, … 10 rather than 1, 10, 11, 2. A leading zero or a letter
    («07», «VIP») keeps it text, because the number would not be the same label.
  */
  if (kind === "id" && PLAIN_INTEGER.test(value)) {
    return numberCell(ref, style, Number(value));
  }

  // Any other numeric column holding text keeps the text; nothing is guessed.
  return textCell(ref, style, value);
}

// --------------------------------- layout ----------------------------------

function measure(sheet: XlsxSheet): ColumnLayout[] {
  const longest = sheet.columns.map(() => 0);

  for (const row of sheet.rows) {
    sheet.columns.forEach((column, i) => {
      const { value, kind } = cellParts(row[i], column.kind);
      const length = displayLength(
        typeof value === "string" ? cellText(value) : value,
        kind,
      );
      if (length > longest[i]!) longest[i] = length;
    });
  }

  return sheet.columns.map((column, i) =>
    columnLayout(cellText(column.header), column.kind, longest[i]!),
  );
}

/** Excel's rules for a tab name: 31 characters, none of `[]:*?/\`. */
export function safeSheetName(name: string): string {
  const cleaned = normalisePersian(name)
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(INVALID_XML, "")
    .replace(/^'+|'+$/g, "")
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned || "Sheet1";
}

// -------------------------------- documents --------------------------------

function sheetXml(sheet: XlsxSheet, layout: readonly ColumnLayout[]): string {
  const lastColumn = columnLetter(Math.max(sheet.columns.length - 1, 0));
  const lastRow = sheet.rows.length + 1;
  const range = `A1:${lastColumn}${lastRow}`;

  const cols = layout
    .map(
      (col, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`,
    )
    .join("");

  const header =
    `<row r="1" ht="${ROW_HEIGHTS.header}" customHeight="1">` +
    sheet.columns
      .map((column, i) => textCell(`${columnLetter(i)}1`, HEADER_STYLE, column.header))
      .join("") +
    "</row>";

  const body = sheet.rows.map((row, r) => {
    const rowNumber = r + 2;
    let lines = 1;

    const cells = sheet.columns.map((column, i) => {
      const { value, kind } = cellParts(row[i], column.kind);
      const { wrap, width } = layout[i]!;
      const wraps = wrap && kind === "text";

      if (wraps && typeof value === "string") {
        lines = Math.max(lines, linesNeeded(displayLength(cellText(value), kind), width));
      }

      return cellXml(
        `${columnLetter(i)}${rowNumber}`,
        bodyStyle(kind, wraps),
        value,
        kind,
      );
    });

    return `<row r="${rowNumber}" ht="${rowHeight(lines)}" customHeight="1">${cells.join("")}</row>`;
  });

  const zebra =
    sheet.rows.length > 1
      ? `<conditionalFormatting sqref="A2:${lastColumn}${lastRow}">` +
        '<cfRule type="expression" dxfId="0" priority="1"><formula>MOD(ROW(),2)=1</formula></cfRule>' +
        "</conditionalFormatting>"
      : "";

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="${range}"/>` +
    // Right to left, with the header row frozen in place while scrolling.
    '<sheetViews><sheetView rightToLeft="1" workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    "</sheetView></sheetViews>" +
    `<sheetFormatPr defaultRowHeight="${ROW_HEIGHTS.body}" customHeight="1"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${header}${body.join("")}</sheetData>` +
    `<autoFilter ref="${range}"/>` +
    zebra +
    '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    /*
      Phone numbers are text on purpose, to keep the leading zero. Without this
      Excel flags each one with a green "number stored as text" triangle and
      offers to "fix" it into a number that can no longer be dialled.
    */
    `<ignoredErrors><ignoredError sqref="${range}" numberStoredAsText="1"/></ignoredErrors>` +
    "</worksheet>"
  );
}

function quotedSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function workbookXml(name: string, columnCount: number, rowCount: number): string {
  const ref = quotedSheet(escapeAttr(name));
  const last = columnLetter(Math.max(columnCount - 1, 0));

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews>' +
    `<sheets><sheet name="${escapeAttr(name)}" sheetId="1" r:id="rId1"/></sheets>` +
    "<definedNames>" +
    `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${ref}!$A$1:$${last}$${rowCount + 1}</definedName>` +
    // The header row repeats at the top of every printed page.
    `<definedName name="_xlnm.Print_Titles" localSheetId="0">${ref}!$1:$1</definedName>` +
    "</definedNames>" +
    "</workbook>"
  );
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  "</Types>";

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

function corePropsXml(title: string, created: Date): string {
  const stamp = `${created.toISOString().slice(0, 19)}Z`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeText(title)}</dc:title><dc:creator>Restokar</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
    "</cp:coreProperties>"
  );
}

// ---------------------------------- entry ----------------------------------

/** A complete `.xlsx` file with one styled, right-to-left sheet. */
export function toXlsx(sheet: XlsxSheet): Buffer {
  const created = sheet.created ?? new Date();
  const name = safeSheetName(sheet.name);
  const layout = measure(sheet);

  return zip(
    [
      { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
      { name: "_rels/.rels", data: ROOT_RELS_XML },
      { name: "docProps/core.xml", data: corePropsXml(name, created) },
      {
        name: "xl/workbook.xml",
        data: workbookXml(name, sheet.columns.length, sheet.rows.length),
      },
      { name: "xl/_rels/workbook.xml.rels", data: WORKBOOK_RELS_XML },
      { name: "xl/styles.xml", data: STYLES_XML },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml(sheet, layout) },
    ],
    created,
  );
}
