import path from "node:path";
import { env } from "../env";

// Not marked `server-only`: the scheduled backup CLI imports this outside any
// React context, where that marker throws. The `node:path` import above already
// makes the module impossible to bundle for a browser.

/**
 * Where customer-owned files live, and the rules for addressing them safely.
 *
 * The whole point of this module is that nothing customers create is stored
 * inside the application tree any more. Uploads used to be written to
 * `public/uploads`, which sat in the middle of the code — one directory away
 * from `public/fonts`, inside the folder a deploy replaces wholesale. That made
 * "regenerate the core project" and "keep the customers' photos" the same
 * operation, and only one of them can win.
 *
 * `DATA_DIR` now points somewhere outside the repo (`./data` by default, an
 * absolute path such as `/var/lib/restokar` in production). See
 * docs/DATA-BOUNDARY.md for the full contract.
 *
 * The public URL is deliberately unchanged: files are still addressed as
 * `/uploads/<restaurantId>/<file>`. Those strings are stored in the database on
 * every product, logo, cover and theme background, and one of them is baked
 * into the `backgroundImage` validation regex. Moving the bytes without moving
 * the URL is what makes this a storage change rather than a data migration.
 */

/** Absolute root of the customer-data directory. */
export const DATA_ROOT = path.resolve(process.cwd(), env.DATA_DIR);

/** Customer-uploaded images, one directory per tenant. */
export const UPLOADS_ROOT = path.join(DATA_ROOT, "uploads");

/** Generated backup archives, written by the scheduled job. */
export const BACKUPS_ROOT = path.join(DATA_ROOT, "backups");

/** Public URL prefix. Unchanged from when these files lived under `public/`. */
export const UPLOADS_URL_PREFIX = "/uploads";

/** The directory one tenant's uploads belong in. */
export function tenantUploadDir(restaurantId: string): string {
  return path.join(UPLOADS_ROOT, restaurantId);
}

/** The public URL for a stored file. */
export function uploadUrl(restaurantId: string, filename: string): string {
  return `${UPLOADS_URL_PREFIX}/${restaurantId}/${filename}`;
}

/**
 * The platform's own images (logo, social card) — uploaded by the admin, kept
 * beside the tenants' folders so they share the /uploads/ URL contract and the
 * backup. Tenant folders are cuids, so "site" can never collide with one.
 */
export const SITE_UPLOAD_SEGMENT = "site";

export function siteUploadDir(): string {
  return path.join(UPLOADS_ROOT, SITE_UPLOAD_SEGMENT);
}

export function siteUploadUrl(filename: string): string {
  return `${UPLOADS_URL_PREFIX}/${SITE_UPLOAD_SEGMENT}/${filename}`;
}

/**
 * Maps a request's path segments onto a real file, or refuses.
 *
 * Serving uploads through a route handler rather than as static files means
 * this code — not the framework — is what stands between a URL and the disk, so
 * traversal is checked twice over. Segments are rejected outright if they
 * contain a separator, a `..`, a NUL, or anything outside the character set our
 * own generated names use; then the resolved absolute path is confirmed to be
 * inside `UPLOADS_ROOT`. The second check is the one that actually holds,
 * because it survives any encoding trick the first might not anticipate: a path
 * that escapes the root cannot resolve back inside it.
 *
 * Returns `null` rather than throwing — every rejection is a 404 to the caller,
 * so a probe learns nothing about which paths exist.
 */
export function resolveUploadPath(segments: string[]): string | null {
  if (segments.length === 0 || segments.length > 4) return null;

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    if (segment.includes("\0")) return null;
    // Our own names are cuids and hex tokens; anything else is not ours.
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) return null;
  }

  const candidate = path.resolve(UPLOADS_ROOT, ...segments);
  const relative = path.relative(UPLOADS_ROOT, candidate);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return candidate;
}

/**
 * Content types we are willing to emit, keyed by our own extensions.
 *
 * Derived from the upload allow-list rather than sniffed from the file or read
 * off the request: serving a stored byte stream under a type the caller
 * influences is how an image host becomes an XSS host.
 */
export const SERVABLE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function contentTypeFor(filePath: string): string | null {
  return SERVABLE_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}
