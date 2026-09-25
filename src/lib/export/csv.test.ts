import { describe, expect, it } from "vitest";
import { UTF8_BOM, exportFilename, guardFormula, toCsv } from "./csv";

/**
 * The document minus its byte-order mark, split into rows.
 *
 * Strips exactly one trailing separator rather than trimming: a row whose every
 * cell is empty is a legitimate row, and `trimEnd()` silently ate it — which
 * made the non-finite-number case look like it produced nothing at all.
 */
const rowsOf = (csv: string) => {
  const body = csv.slice(UTF8_BOM.length);
  return (body.endsWith("\r\n") ? body.slice(0, -2) : body).split("\r\n");
};

describe("toCsv", () => {
  it("writes a header and one row per record", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        [1, 2],
        [3, 4],
      ],
    );

    expect(rowsOf(csv)).toEqual(["a,b", "1,2", "3,4"]);
  });

  it("writes a header even with no rows", () => {
    expect(rowsOf(toCsv(["a", "b"], []))).toEqual(["a,b"]);
  });

  // --- encoding -------------------------------------------------------------

  /**
   * The single most important assertion in this file. Without the mark Excel
   * decodes the file with the machine's legacy codepage and every Persian name
   * arrives as mojibake — the file is valid UTF-8, Excel simply does not look.
   */
  it("starts with a byte-order mark so Excel reads it as UTF-8", () => {
    /*
      The code point is asserted directly rather than via `startsWith(UTF8_BOM)`.

      That form passes vacuously if the constant is ever emptied — `"x".startsWith("")`
      is true — and an editor or a formatter stripping an invisible character
      from a source file is exactly the kind of accident this guards against.
      Checking U+FEFF by number cannot be fooled that way.
    */
    expect(UTF8_BOM).toHaveLength(1);
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);

    expect(toCsv(["نام"], [["چیزبرگر"]]).charCodeAt(0)).toBe(0xfeff);
  });

  /** And the bytes on the wire are the three Excel actually looks for. */
  it("encodes that mark as the EF BB BF byte sequence", () => {
    const bytes = new TextEncoder().encode(toCsv(["a"], [["b"]]));

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("round-trips Persian text unchanged", () => {
    const csv = toCsv(["محصول", "دسته"], [["چیزبرگر ویژه", "برگرها"]]);

    expect(rowsOf(csv)).toEqual(["محصول,دسته", "چیزبرگر ویژه,برگرها"]);
  });

  // --- escaping -------------------------------------------------------------

  it("quotes a value containing the delimiter", () => {
    expect(rowsOf(toCsv(["a"], [["one,two"]]))).toEqual(["a", '"one,two"']);
  });

  it("doubles embedded quotes, per RFC 4180", () => {
    expect(rowsOf(toCsv(["a"], [['say "hi"']]))).toEqual(["a", '"say ""hi"""']);
  });

  it("quotes a value containing a newline rather than breaking the row", () => {
    const csv = toCsv(["note"], [["line one\nline two"]]);

    // One header row plus one data row that happens to span two lines.
    expect(csv.slice(UTF8_BOM.length)).toContain('"line one\nline two"');
  });

  // --- numbers --------------------------------------------------------------

  /**
   * The reason the export exists: a spreadsheet has to be able to add the
   * column up. «۱٬۲۵۰٬۰۰۰ تومان» is a string to Excel; `1250000` is money.
   */
  it("writes numbers bare, with no separators or currency", () => {
    expect(rowsOf(toCsv(["amount"], [[1_250_000]]))).toEqual(["amount", "1250000"]);
  });

  it("keeps a negative number numeric rather than quoting it as text", () => {
    // Guarding this as a formula would break arithmetic on a legitimate loss.
    expect(rowsOf(toCsv(["profit"], [[-50_000]]))).toEqual(["profit", "-50000"]);
  });

  it("writes an empty cell for a missing value, not the word null", () => {
    expect(rowsOf(toCsv(["a", "b"], [[null, undefined]]))).toEqual(["a,b", ","]);
  });

  /** `NaN` in a numeric column would be read as text and poison the column. */
  it("writes an empty cell for a non-finite number", () => {
    expect(rowsOf(toCsv(["a"], [[NaN], [Infinity]]))).toEqual(["a", "", ""]);
  });

  it("writes booleans as 1 and 0 so they stay countable", () => {
    expect(rowsOf(toCsv(["ok"], [[true], [false]]))).toEqual(["ok", "1", "0"]);
  });

  // --- formula injection ----------------------------------------------------

  /**
   * A real and long-standing spreadsheet attack. Product names, category names
   * and order notes all come from outside the platform, and Excel executes a
   * cell beginning with `=` the moment the owner opens the file.
   */
  it("neutralises a cell that would otherwise run as a formula", () => {
    const csv = toCsv(["name"], [['=HYPERLINK("http://evil")']]);

    expect(rowsOf(csv)[1]).toBe('"\'=HYPERLINK(""http://evil"")"');
  });

  it("guards every prefix Excel treats as a formula", () => {
    for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(guardFormula(`${prefix}cmd`)).toBe(`'${prefix}cmd`);
    }
  });

  it("leaves ordinary text alone", () => {
    expect(guardFormula("چیزبرگر")).toBe("چیزبرگر");
    expect(guardFormula("Regular name")).toBe("Regular name");
    expect(guardFormula("")).toBe("");
  });
});

describe("exportFilename", () => {
  it("is predictable and sortable", () => {
    expect(exportFilename("sales", "burger-khaneh", "2026-09-15")).toBe(
      "restokar-burger-khaneh-sales-2026-09-15.csv",
    );
  });

  /**
   * A venue named «کافه نبش» must not produce a Persian filename: it survives a
   * modern OS but not every download path, email gateway or Windows share.
   */
  it("slugifies a non-latin venue name out of the filename", () => {
    const name = exportFilename("sales", "کافه-نبش", "2026-09-15");

    expect(name).toMatch(/^[\x20-\x7e]+$/);
    expect(name).toBe("restokar-venue-sales-2026-09-15.csv");
  });

  it("strips anything a filesystem would object to", () => {
    expect(exportFilename("sales", "a/b\\c:d*e", "2026-09-15")).toBe(
      "restokar-a-b-c-d-e-sales-2026-09-15.csv",
    );
  });
});
