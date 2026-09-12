import { describe, expect, it } from "vitest";
import { exceedsImageLimits, readImageDimensions } from "./dimensions";
import { MAX_IMAGE_EDGE, MAX_IMAGE_EDGE_HARD, MAX_IMAGE_PIXELS } from "@/lib/constants";

/**
 * The upload route's decompression-bomb guard depends entirely on this parser
 * reading headers correctly, and it is hand-written byte manipulation — the
 * kind of code that breaks silently and is never noticed until someone uploads
 * the one format nobody tested.
 */

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

describe("PNG", () => {
  const png = (width: number, height: number) =>
    bytes(
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // signature
      0x00,
      0x00,
      0x00,
      0x0d, // IHDR length
      ...ascii("IHDR"),
      (width >>> 24) & 0xff,
      (width >>> 16) & 0xff,
      (width >>> 8) & 0xff,
      width & 0xff,
      (height >>> 24) & 0xff,
      (height >>> 16) & 0xff,
      (height >>> 8) & 0xff,
      height & 0xff,
    );

  it("reads dimensions from IHDR", () => {
    expect(readImageDimensions(png(1600, 1200))).toEqual({ width: 1600, height: 1200 });
  });

  it("reads a bomb-sized PNG as unsigned rather than negative", () => {
    // 30000 fits in 16 bits, but a width past 2^31 would come back negative
    // through a signed shift and slip under every `> max` comparison.
    const huge = png(3_000_000_000, 4);
    const read = readImageDimensions(huge)!;
    expect(read.width).toBeGreaterThan(0);
    expect(read.width).toBeGreaterThan(MAX_IMAGE_EDGE_HARD);
  });

  it("rejects a truncated header", () => {
    expect(readImageDimensions(png(100, 100).slice(0, 18))).toBeNull();
  });
});

describe("GIF", () => {
  it("reads little-endian screen dimensions", () => {
    const gif = bytes(...ascii("GIF89a"), 0x20, 0x03, 0xf0, 0x01);
    expect(readImageDimensions(gif)).toEqual({ width: 800, height: 496 });
  });
});

describe("WebP", () => {
  const riff = (chunk: string, rest: number[]) =>
    bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(chunk), ...rest);

  it("reads the extended (VP8X) form", () => {
    // 24-bit little-endian, stored minus one.
    const rest = [0, 0, 0, 0, 0, 0, 0, 0, 0x4f, 0x06, 0x00, 0x2f, 0x04, 0x00];
    expect(readImageDimensions(riff("VP8X", rest))).toEqual({
      width: 1616,
      height: 1072,
    });
  });

  it("reads the lossy (VP8 ) form", () => {
    const rest = [
      0,
      0,
      0,
      0,
      0,
      0,
      0, // frame tag + padding to the sync code
      0x9d,
      0x01,
      0x2a,
      0x40,
      0x06, // width  = 1600
      0xb0,
      0x04, // height = 1200
    ];
    expect(readImageDimensions(riff("VP8 ", rest))).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("refuses a RIFF container that is not WebP", () => {
    // A WAV starts "RIFF" too — the reason the upload route checks byte 8.
    const wav = bytes(
      ...ascii("RIFF"),
      0,
      0,
      0,
      0,
      ...ascii("WAVE"),
      ...new Array(20).fill(0),
    );
    expect(readImageDimensions(wav)).toBeNull();
  });
});

describe("JPEG", () => {
  /** SOI, one variable-length segment to skip, then a frame header. */
  const jpeg = (width: number, height: number, extraSegment = true) =>
    bytes(
      0xff,
      0xd8,
      ...(extraSegment
        ? [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46] // APP0, length 6
        : []),
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    );

  it("walks past variable-length segments to reach the frame header", () => {
    expect(readImageDimensions(jpeg(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it("reads a frame header that comes first", () => {
    expect(readImageDimensions(jpeg(640, 480, false))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("gives up at start-of-scan rather than reading pixel data as a header", () => {
    const truncated = bytes(0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(readImageDimensions(truncated)).toBeNull();
  });

  it("terminates on malformed input instead of spinning", () => {
    // A zero-length segment would loop forever if the length were trusted.
    const malformed = bytes(
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x00,
      ...new Array(40).fill(0xff),
    );
    expect(() => readImageDimensions(malformed)).not.toThrow();
  });
});

describe("unknown input", () => {
  it("returns null rather than guessing", () => {
    expect(readImageDimensions(bytes(1, 2, 3, 4))).toBeNull();
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
  });
});

describe("exceedsImageLimits", () => {
  const live = { maxEdge: MAX_IMAGE_EDGE_HARD, maxPixels: MAX_IMAGE_PIXELS };

  it("accepts a normal phone photo", () => {
    // 4032×3024 is what an iPhone writes. Someone whose browser could not run
    // the resize must still be able to upload.
    expect(exceedsImageLimits({ width: 4032, height: 3024 }, live)).toBe(false);
  });

  it("accepts an image already shrunk by the browser", () => {
    expect(exceedsImageLimits({ width: 1600, height: 1067 }, live)).toBe(false);
  });

  it("rejects an over-long edge", () => {
    expect(exceedsImageLimits({ width: 20000, height: 10 }, live)).toBe(true);
    expect(exceedsImageLimits({ width: 10, height: 20000 }, live)).toBe(true);
  });

  it("rejects on area even when both edges are legal", () => {
    // The shape a single-edge check misses. Unreachable at the current edge
    // cap, which is the point of testing it against a looser one: if the edge
    // limit is ever raised, this bound is what still catches the bomb.
    const loose = { maxEdge: 100_000, maxPixels: MAX_IMAGE_PIXELS };
    expect(exceedsImageLimits({ width: 20_000, height: 20_000 }, loose)).toBe(true);
    expect(exceedsImageLimits({ width: 5_000, height: 5_000 }, loose)).toBe(false);
  });

  it("does not reject on unreadable or zero dimensions", () => {
    // A header this parser cannot read is not evidence of an attack, and the
    // magic bytes have already proven the file is an image.
    expect(exceedsImageLimits({ width: 0, height: 0 }, live)).toBe(false);
  });

  it("keeps the client target well inside the server ceiling", () => {
    // The browser aims for MAX_IMAGE_EDGE; the server refuses above
    // MAX_IMAGE_EDGE_HARD. The gap absorbs rounding differences between
    // devices rather than rejecting a 1601px upload.
    expect(MAX_IMAGE_EDGE).toBeLessThan(MAX_IMAGE_EDGE_HARD);
    expect(
      exceedsImageLimits({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE }, live),
    ).toBe(false);
  });
});
