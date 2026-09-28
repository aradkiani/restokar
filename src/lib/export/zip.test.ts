import { describe, expect, it } from "vitest";
import { unzip } from "@/test/unzip";
import { crc32, zip } from "./zip";

describe("crc32", () => {
  /** The standard check value every CRC-32 implementation is tested against. */
  it("matches the reference check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for no bytes", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zip", () => {
  it("round-trips every entry byte for byte", () => {
    const entries = [
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "xl/worksheets/sheet1.xml", data: "<t>چیزبرگر ویژه</t>".repeat(500) },
      { name: "bin", data: new Uint8Array([0, 1, 2, 255]) },
    ];

    const files = unzip(zip(entries, new Date(Date.UTC(2026, 8, 15, 12, 30))));

    expect([...files.keys()]).toEqual(entries.map((e) => e.name));
    expect(files.get("xl/worksheets/sheet1.xml")!.toString("utf8")).toBe(
      entries[1]!.data,
    );
    expect([...files.get("bin")!]).toEqual([0, 1, 2, 255]);
  });

  it("compresses repetitive XML", () => {
    const xml = "<row><c/></row>".repeat(10_000);
    expect(zip([{ name: "a.xml", data: xml }]).length).toBeLessThan(xml.length / 10);
  });

  it("writes an empty archive that is still valid", () => {
    expect(unzip(zip([])).size).toBe(0);
  });
});
