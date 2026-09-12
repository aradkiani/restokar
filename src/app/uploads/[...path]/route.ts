import { readFile, stat } from "node:fs/promises";
import { contentTypeFor, resolveUploadPath } from "@/lib/storage/paths";

export const runtime = "nodejs";

/**
 * Serves customer-uploaded images from the data directory.
 *
 * These files used to sit in `public/uploads` and be served by the framework as
 * static assets. They were moved out so that the application tree contains no
 * customer-owned data (docs/DATA-BOUNDARY.md); this route preserves the URL
 * they were already published under, which matters because those URLs are
 * stored on every product row and printed into no fewer than three columns of
 * the Restaurant table.
 *
 * Public and unauthenticated by design — a guest reads a menu before they have
 * any identity, and these are the pictures on it. What the route does *not* do
 * is trust the path: `resolveUploadPath` rejects anything that is not one of
 * our own generated names and then confirms the resolved file is inside the
 * uploads root, so `/uploads/../../.env` is a 404 rather than a disclosure.
 *
 * In production nginx should serve this directory directly (see DEPLOY.md) —
 * this handler is the portable path that works with no proxy configured, and
 * the correctness of the traversal check does not depend on which one runs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  const filePath = resolveUploadPath(segments ?? []);
  if (!filePath) return notFound();

  const contentType = contentTypeFor(filePath);
  if (!contentType) return notFound();

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return notFound();

    const body = await readFile(filePath);

    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": contentType,
        "content-length": String(stats.size),
        // Stored names are 16 random bytes and content never changes under a
        // name, so this is safe to cache hard. An edited photo gets a new name.
        "cache-control": "public, max-age=31536000, immutable",
        // Belt and braces next to the global nosniff header: these bytes came
        // from a customer, and nothing should ever try to interpret them.
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}

/** One shape for every refusal, so probing reveals nothing. */
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}
