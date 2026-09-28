import { deflateRawSync } from "node:zlib";

/**
 * The smallest zip writer an `.xlsx` file needs.
 *
 * An `.xlsx` file is a zip archive of XML documents. Node already carries
 * DEFLATE in `zlib`, so the archive itself is a few fixed-size headers around
 * the compressed bytes — written here rather than pulled in as a dependency,
 * the same decision the codebase made for CSV, charts and SOAP.
 *
 * Deliberately limited to what a spreadsheet export needs: files only, no
 * directories, no encryption, no ZIP64. An export large enough to need ZIP64
 * (4 GB) is refused rather than written corrupt.
 */

export interface ZipEntry {
  /** Path inside the archive, forward slashes. */
  name: string;
  data: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as zip defines it (IEEE 802.3, reflected). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, the only timestamp a plain zip header can hold. */
function dosTimestamp(when: Date): { time: number; date: number } {
  const year = Math.min(Math.max(when.getUTCFullYear(), 1980), 2107);
  return {
    time:
      (when.getUTCHours() << 11) |
      (when.getUTCMinutes() << 5) |
      Math.floor(when.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate(),
  };
}

/** Bit 11: the entry name is UTF-8. */
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
const VERSION = 20;
const ZIP32_LIMIT = 0xffffffff;

export function zip(entries: readonly ZipEntry[], modified: Date = new Date()): Buffer {
  if (entries.length > 0xffff) throw new Error("Too many zip entries");

  const { time, date } = dosTimestamp(modified);
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw =
      typeof entry.data === "string"
        ? Buffer.from(entry.data, "utf8")
        : Buffer.from(entry.data);
    const packed = deflateRawSync(raw);
    const checksum = crc32(raw);

    if (raw.length > ZIP32_LIMIT || offset > ZIP32_LIMIT) {
      throw new Error("Export too large for a zip archive");
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    // Extra length, comment length, disk, internal and external attributes: 0.
    central.writeUInt32LE(offset, 42);

    parts.push(local, name, packed);
    directory.push(central, name);
    offset += local.length + name.length + packed.length;
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  if (offset + directorySize > ZIP32_LIMIT)
    throw new Error("Export too large for a zip archive");

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, ...directory, end]);
}
