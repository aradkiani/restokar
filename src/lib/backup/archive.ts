import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * A minimal POSIX (ustar) tar writer, gzipped.
 *
 * Written by hand rather than pulled from a package because tar's format is a
 * 512-byte header and some padding, and this needs no compatibility beyond
 * "GNU tar and 7-Zip can open it". The alternative shapes were worse: a single
 * JSON file with the images base64-encoded inflates every photo by a third and
 * produces something only this codebase can read, and a zip library is a
 * dependency for a format with no advantage here.
 *
 * Entries are streamed one at a time through gzip and straight to disk, so peak
 * memory is one entry rather than the size of the backup. That matters as the
 * order table grows — the database dump is written one table per entry for the
 * same reason.
 */

export interface ArchiveEntry {
  /** Path inside the archive, e.g. `database/Order.json`. */
  name: string;
  content: Buffer;
  /** Defaults to now. Kept for reproducibility in tests. */
  mtime?: Date;
}

const BLOCK_SIZE = 512;

/** Octal, NUL-terminated, left-padded with zeroes — how tar stores numbers. */
function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

function buildHeader(entry: ArchiveEntry): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE);
  const name = entry.name;

  // ustar splits long paths across `prefix` (155) and `name` (100). Nothing
  // this backup writes comes close, so the case is refused loudly rather than
  // silently truncated into a file that restores to the wrong place.
  if (Buffer.byteLength(name) > 100) {
    throw new Error(`Archive entry name is too long for ustar: ${name}`);
  }

  header.write(name, 0, 100, "utf8");
  header.write(octal(0o644, 8), 100, 8, "ascii"); // mode
  header.write(octal(0, 8), 108, 8, "ascii"); // uid
  header.write(octal(0, 8), 116, 8, "ascii"); // gid
  header.write(octal(entry.content.length, 12), 124, 12, "ascii");
  header.write(
    octal(Math.floor((entry.mtime ?? new Date()).getTime() / 1000), 12),
    136,
    12,
    "ascii",
  );
  header.write("        ", 148, 8, "ascii"); // checksum placeholder: spaces
  header.write("0", 156, 1, "ascii"); // typeflag: regular file
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");

  // The checksum is the unsigned sum of every header byte, computed while the
  // checksum field itself reads as spaces — hence the placeholder above.
  let sum = 0;
  for (const byte of header) sum += byte;

  // Six octal digits, NUL, then a space. This exact layout is what tar expects.
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

  return header;
}

/** Zero bytes rounding an entry up to the next 512-byte boundary. */
function padding(size: number): Buffer {
  const remainder = size % BLOCK_SIZE;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK_SIZE - remainder);
}

async function* tarStream(
  entries: AsyncIterable<ArchiveEntry> | Iterable<ArchiveEntry>,
): AsyncGenerator<Buffer> {
  for await (const entry of entries) {
    yield buildHeader(entry);
    yield entry.content;
    const pad = padding(entry.content.length);
    if (pad.length > 0) yield pad;
  }
  // Two zero blocks mark end-of-archive.
  yield Buffer.alloc(BLOCK_SIZE * 2);
}

/** Writes entries as a gzipped tar at `outPath`. */
export async function writeTarGz(
  outPath: string,
  entries: AsyncIterable<ArchiveEntry> | Iterable<ArchiveEntry>,
): Promise<void> {
  await pipeline(
    Readable.from(tarStream(entries)),
    createGzip({ level: 9 }),
    createWriteStream(outPath),
  );
}
