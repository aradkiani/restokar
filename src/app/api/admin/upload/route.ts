import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fail, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { randomToken } from "@/lib/utils";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { siteUploadDir, siteUploadUrl } from "@/lib/storage/paths";
import { acceptImageUpload } from "@/lib/images/accept-upload";

export const runtime = "nodejs";

/**
 * The platform admin's image upload (logo, social-sharing card). Same checks
 * as a restaurant's upload — type, signature, size, dimensions — and written
 * under DATA_DIR/uploads/site, so it is served at /uploads/site/<file> and
 * included in the backup.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();

  const limit = await rateLimit(`admin:upload:${admin.id}:${clientIp(request)}`, {
    limit: 60,
    windowSeconds: 300,
  });
  if (!limit.allowed) return fail(429, "تعداد آپلودها زیاد است.", "RATE_LIMITED");

  const accepted = await acceptImageUpload(await request.formData().catch(() => null));
  if (!accepted.ok) return fail(accepted.status, accepted.message, accepted.code);

  const filename = `${randomToken(16)}.${accepted.ext}`;
  const dir = siteUploadDir();
  await mkdir(dir, { recursive: true });
  // Under DATA_DIR, outside the code: nothing for the bundler to trace.
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, filename), accepted.bytes);

  return ok({ url: siteUploadUrl(filename) }, { status: 201 });
});
