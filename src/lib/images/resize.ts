"use client";

import { IMAGE_QUALITY, MAX_IMAGE_EDGE } from "@/lib/constants";

/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * This is the single biggest cost in the product. Uploads were stored exactly as
 * the phone produced them — a modern camera writes 3–5MB at 4000×3000 — so a
 * venue with thirty dishes served roughly 60MB to every guest who scrolled its
 * whole menu, over Iranian mobile data, to fill cards a few hundred pixels wide.
 * Nothing on screen was ever better for it.
 *
 * Done in the browser with a canvas rather than on the server: server-side
 * re-encoding means `sharp` or an equivalent, which is a native binary that has
 * to build on the host, and the work would land on the one CPU that also has to
 * serve menus. Here it costs the uploader's own device a few hundred
 * milliseconds, once, and the server receives something already small.
 *
 * "Without losing quality" is meant literally:
 *   * an image already within the size limit is never enlarged;
 *   * the result is kept only if it is actually smaller than the original;
 *   * WebP at quality 0.86 is visually indistinguishable from the source at
 *     normal viewing sizes while typically costing 70–90% fewer bytes;
 *   * EXIF orientation is honoured, so portrait photos do not arrive sideways.
 */

export interface ResizeOutcome {
  file: File;
  /** False when the original was returned untouched. */
  changed: boolean;
  originalBytes: number;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Animated GIFs are passed through untouched.
 *
 * A canvas holds one frame, so re-encoding one would silently discard the
 * animation — turning a moving image into a still without telling anyone. They
 * are rare on a menu and the byte ceiling still applies to them.
 */
const PASSTHROUGH_TYPES = new Set(["image/gif"]);

export async function shrinkImage(file: File): Promise<ResizeOutcome> {
  const untouched = (width = 0, height = 0): ResizeOutcome => ({
    file,
    changed: false,
    originalBytes: file.size,
    bytes: file.size,
    width,
    height,
  });

  if (PASSTHROUGH_TYPES.has(file.type)) return untouched();
  if (typeof document === "undefined") return untouched();

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await loadBitmap(file);
    const { width: sourceWidth, height: sourceHeight } = bitmap;

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) return untouched(sourceWidth, sourceHeight);

    // Downscaling in one step is what makes a resized photo look soft; the
    // browser's own filtering at "high" quality is a good bicubic and costs
    // nothing to ask for.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const encoded = await encode(canvas);
    if (!encoded) return untouched(sourceWidth, sourceHeight);

    // Re-encoding can lose. A small PNG logo or an already-optimised photo can
    // come back bigger, and shipping the larger file would defeat the purpose.
    if (scale === 1 && encoded.size >= file.size) {
      return untouched(sourceWidth, sourceHeight);
    }

    const extension = encoded.type === "image/webp" ? "webp" : "jpg";
    const shrunk = new File([encoded], renameTo(file.name, extension), {
      type: encoded.type,
      lastModified: Date.now(),
    });

    return {
      file: shrunk,
      changed: true,
      originalBytes: file.size,
      bytes: shrunk.size,
      width: targetWidth,
      height: targetHeight,
    };
  } catch {
    // A decode failure is not a reason to block the upload — the server still
    // validates type, magic bytes, dimensions and size.
    return untouched();
  } finally {
    bitmap?.close?.();
  }
}

/**
 * `createImageBitmap` is both faster and the only path that applies EXIF
 * rotation for us. Safari added the orientation option late, so the `<img>`
 * fallback stays — browsers there apply orientation during decode anyway.
 */
async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("decode failed"));
      element.src = url;
    });
    return await createImageBitmap(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** WebP where available, JPEG otherwise. Both are on the upload allow-list. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const webp = await toBlob(canvas, "image/webp", IMAGE_QUALITY);
  // Browsers that cannot encode WebP silently hand back a PNG instead, which
  // for a photograph is far larger than the JPEG we actually want.
  if (webp && webp.type === "image/webp") return webp;
  return toBlob(canvas, "image/jpeg", IMAGE_QUALITY);
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renameTo(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${extension}`;
}
