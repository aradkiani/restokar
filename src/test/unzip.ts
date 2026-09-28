import { inflateRawSync } from "node:zlib";
import { crc32 } from "@/lib/export/zip";

/**
 * Test-only zip reader: every entry by name, checksum verified.
 *
 * Reads through the central directory the way Excel does, so a test that
 * passes here is reading the same offsets and sizes a real consumer would.
 */
export function unzip(archive: Buffer): Map<string, Buffer> {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("No end-of-central-directory record");

  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();

  for (let i = 0; i < count; i += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("Bad central header");

    const method = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16);
    const packedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const offset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (archive.readUInt32LE(offset) !== 0x04034b50)
      throw new Error(`Bad local header: ${name}`);
    const start =
      offset + 30 + archive.readUInt16LE(offset + 26) + archive.readUInt16LE(offset + 28);
    const packed = archive.subarray(start, start + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : Buffer.from(packed);

    if (data.length !== size) throw new Error(`Size mismatch: ${name}`);
    if (crc32(data) !== checksum) throw new Error(`Checksum mismatch: ${name}`);

    files.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}
