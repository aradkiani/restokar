/**
 * Reads pixel dimensions straight out of an image's header bytes.
 *
 * The upload route needs to know how large an image *decodes* to, not just how
 * many bytes arrived. A 40MB PNG of a single colour compresses to a few
 * kilobytes and sails past a byte limit, then costs ~1.6GB of memory the moment
 * anything decodes it — the classic decompression bomb. A byte cap alone cannot
 * see that coming.
 *
 * Parsed by hand rather than with an image library because every candidate
 * (sharp, jimp) is either a native binary that has to compile on the server or a
 * megabyte of JavaScript, and all this needs is the first few dozen bytes of
 * four formats we already restrict uploads to.
 *
 * Pure and byte-only, so it is unit-testable without files or a browser.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Whether an image is too large to accept.
 *
 * A predicate rather than an inlined condition in the route, so the policy can
 * be tested against real shapes instead of being asserted by eye.
 *
 * Two bounds, and they are not redundant even though the edge bound is the one
 * that binds today. `MAX_IMAGE_EDGE_HARD` caps either side; `MAX_IMAGE_PIXELS`
 * caps the area. At the current 4096px edge the area can never exceed ~16.8M
 * and the pixel bound is therefore unreachable — it is there so that raising the
 * edge limit later cannot silently reintroduce a decompression bomb, which is
 * exactly the kind of change made in a hurry without re-deriving the
 * consequences.
 */
export function exceedsImageLimits(
  { width, height }: ImageDimensions,
  limits: { maxEdge: number; maxPixels: number },
): boolean {
  if (width <= 0 || height <= 0) return false;
  if (width > limits.maxEdge || height > limits.maxEdge) return true;
  return width * height > limits.maxPixels;
}

/** Returns dimensions, or null when the header is absent, truncated or unknown. */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return readPng(bytes) ?? readGif(bytes) ?? readWebp(bytes) ?? readJpeg(bytes) ?? null;
}

function u16be(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!;
}

function u32be(b: Uint8Array, i: number): number {
  // `>>> 0` keeps a 32-bit value unsigned; a large PNG width would otherwise
  // come back negative and slip under a `> max` check.
  return ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
}

function matches(b: Uint8Array, offset: number, ascii: string): boolean {
  for (let i = 0; i < ascii.length; i++) {
    if (b[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/** PNG: 8-byte signature, then an IHDR chunk whose width/height start at 16. */
function readPng(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, i) => b[i] === byte)) return null;
  if (!matches(b, 12, "IHDR")) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** GIF: "GIF87a"/"GIF89a", then little-endian screen width and height. */
function readGif(b: Uint8Array): ImageDimensions | null {
  if (b.length < 10) return null;
  if (!matches(b, 0, "GIF8")) return null;
  return { width: b[6]! | (b[7]! << 8), height: b[8]! | (b[9]! << 8) };
}

/**
 * WebP: a RIFF container whose fourth chunk tag says which of three encodings
 * it is, and each stores its size differently.
 */
function readWebp(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  if (!matches(b, 0, "RIFF") || !matches(b, 8, "WEBP")) return null;

  // Extended format: 24-bit little-endian "minus one" values.
  if (matches(b, 12, "VP8X")) {
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return { width, height };
  }

  // Lossless: 14 bits each, packed into the four bytes after the signature.
  if (matches(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }

  // Lossy: a keyframe header with a three-byte sync code before the sizes.
  if (matches(b, 12, "VP8 ")) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      width: (b[26]! | (b[27]! << 8)) & 0x3fff,
      height: (b[28]! | (b[29]! << 8)) & 0x3fff,
    };
  }

  return null;
}

/**
 * JPEG: no fixed offset — the size lives in a "start of frame" marker that can
 * sit anywhere after a run of variable-length segments, so the markers have to
 * be walked.
 */
function readJpeg(b: Uint8Array): ImageDimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let offset = 2;
  // Bounded by the buffer, and every step advances, so this cannot spin.
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1; // resynchronise on fill bytes
      continue;
    }

    const marker = b[offset + 1]!;

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan: pixel data follows and there is no header left to read.
    if (marker === 0xda || marker === 0xd9) return null;

    const length = u16be(b, offset + 2);
    if (length < 2) return null;

    // SOF0–SOF15 hold the frame size. C4 (Huffman tables), C8 and CC are not
    // frame headers despite falling inside the range.
    const isFrameHeader =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isFrameHeader) {
      return { width: u16be(b, offset + 7), height: u16be(b, offset + 5) };
    }

    offset += 2 + length;
  }

  return null;
}
