import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fail, ok, route } from "@/lib/api";
import { requireTenant } from "@/lib/auth/guards";
import { randomToken } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_IMAGE_EDGE_HARD,
  MAX_IMAGE_PIXELS,
  MAX_UPLOAD_BYTES,
  RATE_LIMITS,
} from "@/lib/constants";
import { tenantUploadDir, uploadUrl } from "@/lib/storage/paths";
import { exceedsImageLimits, readImageDimensions } from "@/lib/images/dimensions";

export const runtime = "nodejs";

/**
 * Allow-list of image types, checked against both the declared MIME type and
 * the file's magic bytes. A client-supplied content-type alone is trivially
 * spoofed, and writing an arbitrary file under a web root is how "image
 * upload" becomes remote code execution.
 *
 * Signatures are `[offset, ...bytes]`. WebP needs two: `RIFF` at 0 identifies a
 * RIFF container generally — a WAV file starts the same way — and only `WEBP`
 * at byte 8 says which kind. Checking the first four alone let any RIFF payload
 * through under a `.webp` name.
 */
const ALLOWED = new Map<string, { ext: string; magic: number[][][] }>([
  ["image/jpeg", { ext: "jpg", magic: [[[0, 0xff, 0xd8, 0xff]]] }],
  ["image/png", { ext: "png", magic: [[[0, 0x89, 0x50, 0x4e, 0x47]]] }],
  [
    "image/webp",
    {
      ext: "webp",
      magic: [
        [
          [0, 0x52, 0x49, 0x46, 0x46], // "RIFF"
          [8, 0x57, 0x45, 0x42, 0x50], // "WEBP"
        ],
      ],
    },
  ],
  ["image/gif", { ext: "gif", magic: [[[0, 0x47, 0x49, 0x46, 0x38]]] }],
]);

/**
 * True when the bytes match any one of the accepted signature sets.
 *
 * A set is a list of `[offset, ...expected]` runs that must *all* match, which
 * is what lets WebP require its second marker.
 */
function matchesMagic(bytes: Uint8Array, signatureSets: number[][][]): boolean {
  return signatureSets.some((set) =>
    set.every(([offset, ...expected]) =>
      expected.every((byte, index) => bytes[offset! + index] === byte),
    ),
  );
}

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTenant();

  const limit = await rateLimit(`upload:${restaurantId}`, RATE_LIMITS.upload);
  if (!limit.allowed) return fail(429, "تعداد آپلودها زیاد است.", "RATE_LIMITED");

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return fail(400, "فایلی ارسال نشده است", "NO_FILE");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, "حجم فایل باید کمتر از ۴ مگابایت باشد", "FILE_TOO_LARGE");
  }

  const spec = ALLOWED.get(file.type);
  if (!spec) {
    return fail(415, "فقط تصویر JPG، PNG، WebP یا GIF مجاز است", "UNSUPPORTED_TYPE");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesMagic(bytes, spec.magic)) {
    return fail(415, "محتوای فایل با نوع آن مطابقت ندارد", "CONTENT_MISMATCH");
  }

  /**
   * Pixel dimensions, checked independently of the byte count.
   *
   * The browser downscales before uploading, but that is a courtesy to the
   * uploader rather than a control: a hand-made request skips it entirely. Two
   * separate limits matter here because they catch different shapes —
   * a very long edge, and a very large *area*. A 20000×20000 PNG of one flat
   * colour compresses to a few kilobytes, so it passes the byte ceiling above
   * and then asks for roughly 1.6GB from anything that decodes it.
   *
   * An unreadable header is not fatal: the magic bytes already proved the type,
   * and rejecting an image because this parser does not recognise an exotic but
   * valid variant would break a legitimate upload for no security gain.
   */
  const dimensions = readImageDimensions(bytes);
  if (
    dimensions &&
    exceedsImageLimits(dimensions, {
      maxEdge: MAX_IMAGE_EDGE_HARD,
      maxPixels: MAX_IMAGE_PIXELS,
    })
  ) {
    return fail(
      413,
      `ابعاد تصویر بیش از حد بزرگ است (حداکثر ${MAX_IMAGE_EDGE_HARD} پیکسل در هر ضلع)`,
      "IMAGE_TOO_LARGE",
    );
  }

  // Filename is generated, never derived from user input — no traversal, no
  // collisions, and the extension comes from our own table.
  const filename = `${randomToken(16)}.${spec.ext}`;

  // Written under DATA_DIR, outside the application tree, so redeploying or
  // regenerating the core project never touches a customer's photos. The URL
  // returned is unchanged — see src/lib/storage/paths.ts.
  const dir = tenantUploadDir(restaurantId);

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  return ok({ url: uploadUrl(restaurantId, filename) }, { status: 201 });
});
