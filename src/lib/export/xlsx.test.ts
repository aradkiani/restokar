import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unzip } from "@/test/unzip";
import type { ExportColumn, ExportRow } from "./cells";
import { SHEET_COLORS, SHEET_FONT } from "./sheet-style";
import { columnLetter, excelDate, excelTime, safeSheetName, toXlsx } from "./xlsx";

const COLUMNS: ExportColumn[] = [
  { header: "محصول", kind: "text" },
  { header: "شماره تماس", kind: "phone" },
  { header: "درآمد (تومان)", kind: "money" },
  { header: "سهم از درآمد", kind: "percent" },
  { header: "تاریخ", kind: "date" },
  { header: "ساعت", kind: "time" },
  { header: "شماره سفارش", kind: "id" },
  { header: "یادداشت", kind: "text" },
];

const LONG_NOTE = `${"لطفا بدون پیاز و با سس جداگانه ".repeat(8)}<&>\u0001`;

const ROWS: ExportRow[] = [
  ["كيك شكلاتي", "09121234567", 1_250_000, 0.482, "2024-01-01", "21:45", 632, "کوتاه"],
  ['=HYPERLINK("http://evil")', null, -50_000, null, "not a date", "", 633, LONG_NOTE],
  [
    "حاشیه سود",
    "",
    { value: 0.3, kind: "percent" },
    0.1,
    "2026-09-15",
    "09:05",
    634,
    null,
  ],
];

function build() {
  const files = unzip(
    toXlsx({
      name: "فروش روزانه",
      columns: COLUMNS,
      rows: ROWS,
      created: new Date(Date.UTC(2026, 8, 15)),
    }),
  );
  const read = (name: string) => files.get(name)!.toString("utf8");
  return {
    files,
    sheet: read("xl/worksheets/sheet1.xml"),
    styles: read("xl/styles.xml"),
    workbook: read("xl/workbook.xml"),
  };
}

const { files, sheet, styles, workbook } = build();

/** The `<xf>` entries of `cellXfs`, in index order. */
function cellXfs(): string[] {
  const block = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1]!;
  return block.match(/<xf [\s\S]*?<\/xf>/g)!;
}

const BUILTIN: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  49: "@",
};

function formatOfStyle(index: number): string {
  const id = Number(/numFmtId="(\d+)"/.exec(cellXfs()[index]!)![1]);
  if (id in BUILTIN) return BUILTIN[id]!;
  const custom = new RegExp(`<numFmt numFmtId="${id}" formatCode="([^"]*)"`).exec(
    styles,
  )![1]!;
  return custom.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function cell(ref: string): string {
  return new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheet)![0];
}

function styleOf(ref: string): number {
  return Number(/ s="(\d+)"/.exec(cell(ref))![1]);
}

function rowTag(n: number): string {
  return new RegExp(`<row r="${n}"[^>]*>`).exec(sheet)![0];
}

describe("the package", () => {
  it("contains every part Excel needs", () => {
    expect([...files.keys()].sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "docProps/core.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
      ].sort(),
    );
  });
});

describe("right to left", () => {
  it("sets the sheet view right to left", () => {
    expect(sheet).toMatch(/<sheetView rightToLeft="1"/);
  });

  it("aligns every cell style right, centred, reading right to left", () => {
    for (const xf of cellXfs()) {
      expect(xf).toContain('horizontal="right"');
      expect(xf).toContain('vertical="center"');
      expect(xf).toContain('readingOrder="2"');
    }
  });

  it("uses one font family everywhere", () => {
    const fonts = styles.match(/<font>[\s\S]*?<\/font>/g)!;
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font).toContain(`<name val="${SHEET_FONT.name}"/>`);
  });
});

describe("the header row", () => {
  it("is bold on the header fill with borders", () => {
    const header = cellXfs()[styleOf("A1")]!;
    const fontId = Number(/fontId="(\d+)"/.exec(header)![1]);
    const fillId = Number(/fillId="(\d+)"/.exec(header)![1]);
    const borderId = Number(/borderId="(\d+)"/.exec(header)![1]);

    expect(styles.match(/<font>[\s\S]*?<\/font>/g)![fontId]).toContain("<b/>");
    expect(styles.match(/<fill>[\s\S]*?<\/fill>/g)![fillId]).toContain(
      SHEET_COLORS.headerFill,
    );
    expect(styles.match(/<border>[\s\S]*?<\/border>/g)![borderId]).toContain(
      'style="thin"',
    );
  });

  it("is frozen while the body scrolls", () => {
    expect(sheet).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    );
  });

  it("carries an autofilter over the whole table", () => {
    expect(sheet).toContain('<autoFilter ref="A1:H4"/>');
    expect(workbook).toContain('name="_xlnm._FilterDatabase"');
  });

  it("repeats on every printed page", () => {
    expect(workbook).toMatch(/_xlnm\.Print_Titles[^>]*>'فروش روزانه'!\$1:\$1</);
  });
});

describe("numbers, dates and text", () => {
  it("writes money as a number with thousands separators", () => {
    expect(cell("C2")).toContain("<v>1250000</v>");
    expect(formatOfStyle(styleOf("C2"))).toBe("#,##0;[Red]-#,##0");
  });

  it("writes a share as a fraction formatted as a percentage", () => {
    expect(cell("D2")).toContain("<v>0.482</v>");
    expect(formatOfStyle(styleOf("D2"))).toBe("0.0%");
  });

  it("formats a typed cell by its own kind, not its column's", () => {
    expect(formatOfStyle(styleOf("C4"))).toBe("0.0%");
  });

  it("writes a date as Excel's day number with a date format", () => {
    expect(cell("E2")).toContain("<v>45292</v>");
    expect(formatOfStyle(styleOf("E2"))).toBe("yyyy/mm/dd");
  });

  it("writes a time as a fraction of a day", () => {
    expect(cell("F2")).toContain(`<v>${21.75 / 24}</v>`);
    expect(formatOfStyle(styleOf("F2"))).toBe("hh:mm");
  });

  it("keeps text that is not a date as text rather than guessing", () => {
    expect(cell("E3")).toContain('t="inlineStr"');
    expect(cell("E3")).toContain("not a date");
  });

  it("keeps a phone number's leading zero, as text, without an apostrophe", () => {
    expect(cell("B2")).toContain('t="inlineStr"');
    expect(cell("B2")).toContain(">09121234567<");
    expect(formatOfStyle(styleOf("B2"))).toBe("@");
  });

  it("writes an order number without separators", () => {
    expect(formatOfStyle(styleOf("G2"))).toBe("0");
  });

  /** Table «4» sorts before table «10» only if it is a number. */
  it("writes a numeric identifier stored as text as a number", () => {
    const tableSheet = unzip(
      toXlsx({
        name: "میزها",
        columns: [{ header: "میز", kind: "id" }],
        rows: [["4"], ["07"], ["VIP"]],
      }),
    )
      .get("xl/worksheets/sheet1.xml")!
      .toString("utf8");

    expect(tableSheet).toMatch(/<c r="A2" s="\d+"><v>4<\/v><\/c>/);
    // A leading zero or a letter is a label, not a number.
    expect(tableSheet).toMatch(/<c r="A3"[^>]*t="inlineStr"><is><t[^>]*>07</);
    expect(tableSheet).toMatch(/<c r="A4"[^>]*t="inlineStr"><is><t[^>]*>VIP</);
  });

  /** Otherwise every phone number wears Excel's green warning triangle. */
  it("tells Excel that text-held numbers are intentional", () => {
    expect(sheet).toContain('<ignoredError sqref="A1:H4" numberStoredAsText="1"/>');
  });

  it("writes Persian letters in place of Arabic look-alikes", () => {
    expect(cell("A2")).toContain("کیک شکلاتی");
    expect(sheet).not.toMatch(/[\u064A\u0643\u0649]/);
  });

  it("still styles an empty cell, so borders and stripes run unbroken", () => {
    expect(cell("B3")).toMatch(/^<c r="B3" s="\d+"\/>$/);
  });
});

describe("layout", () => {
  it("sizes every column explicitly", () => {
    expect(sheet.match(/<col [^>]*customWidth="1"\/>/g)).toHaveLength(COLUMNS.length);
  });

  it("gives single-line rows one height and a wrapped row more", () => {
    const heightOf = (n: number) => Number(/ht="([\d.]+)"/.exec(rowTag(n))![1]);
    expect(heightOf(2)).toBe(heightOf(4));
    expect(heightOf(3)).toBeGreaterThan(heightOf(2));
  });

  it("wraps the long text column", () => {
    expect(cellXfs()[styleOf("H3")]).toContain('wrapText="1"');
  });

  it("stripes every second data row with a rule that survives sorting", () => {
    expect(sheet).toContain('<conditionalFormatting sqref="A2:H4">');
    expect(sheet).toContain("<formula>MOD(ROW(),2)=1</formula>");
    expect(styles).toContain(SHEET_COLORS.zebraFill);
  });
});

describe("safety", () => {
  /** Inline strings are never formulas, so no apostrophe is needed. */
  it("keeps formula-looking text inert", () => {
    expect(sheet).not.toContain("<f>");
    expect(cell("A3")).toContain('t="inlineStr"');
    expect(cell("A3")).toContain('=HYPERLINK("http://evil")');
  });

  it("escapes markup and drops characters XML cannot carry", () => {
    expect(cell("H3")).toContain("&lt;&amp;&gt;");
    expect(cell("H3")).not.toContain("\u0001");
  });
});

describe("helpers", () => {
  it("names columns the way Excel does", () => {
    expect([0, 25, 26, 701, 702].map(columnLetter)).toEqual([
      "A",
      "Z",
      "AA",
      "ZZ",
      "AAA",
    ]);
  });

  it("converts dates and refuses impossible ones", () => {
    expect(excelDate("2024-01-01")).toBe(45292);
    expect(excelDate("2026-02-30")).toBeNull();
    expect(excelDate("15/09/2026")).toBeNull();
  });

  it("converts times and refuses impossible ones", () => {
    expect(excelTime("00:00")).toBe(0);
    expect(excelTime("12:00")).toBe(0.5);
    expect(excelTime("24:10")).toBeNull();
  });

  it("makes any title a legal sheet name", () => {
    const name = safeSheetName(
      "فروش: روزانه/ماهانه [ویژه] با نامی بسیار بلندتر از سی و یک حرف",
    );
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
    expect(safeSheetName("***")).toBe("Sheet1");
  });
});

/**
 * Every export looks the same because every visual decision lives in
 * `sheet-style.ts`. A colour or a font written straight into the writer would
 * be the start of a second look.
 */
describe("one shared look", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./xlsx.ts", import.meta.url)),
    "utf8",
  );

  it("keeps colours and fonts out of the writer", () => {
    expect(source).not.toMatch(/"FF[0-9A-F]{6}"/i);
    expect(source).not.toMatch(/Tahoma|Arial|Calibri/);
  });
});
