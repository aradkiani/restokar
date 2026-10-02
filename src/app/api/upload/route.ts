import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fail, ok, route } from "@/lib/api";
import { requireTenant } from "@/lib/auth/guards";
import { randomToken } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { tenantUploadDir, uploadUrl } from "@/lib/storage/paths";
import { acceptImageUpload } from "@/lib/images/accept-upload";

export const runtime = "nodejs";

/**
 * A restaurant's image upload. What is accepted — type, signature, size,
 * dimensions — is decided in lib/images/accept-upload.ts, shared with the
 * platform admin's upload so the two can never differ.
 */
export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTenant();

  const limit = await rateLimit(`upload:${restaurantId}`, RATE_LIMITS.upload);
  if (!limit.allowed) return fail(429, "تعداد آپلودها زیاد است.", "RATE_LIMITED");

  const accepted = await acceptImageUpload(await request.formData().catch(() => null));
  if (!accepted.ok) return fail(accepted.status, accepted.message, accepted.code);

  // Filename is generated, never derived from user input — no traversal, no
  // collisions, and the extension comes from our own table.
  const filename = `${randomToken(16)}.${accepted.ext}`;

  // Written under DATA_DIR, outside the application tree, so redeploying or
  // regenerating the core project never touches a customer's photos. The URL
  // returned is unchanged — see src/lib/storage/paths.ts.
  const dir = tenantUploadDir(restaurantId);

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), accepted.bytes);

  return ok({ url: uploadUrl(restaurantId, filename) }, { status: 201 });
});
