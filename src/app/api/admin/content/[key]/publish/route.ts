import { fail, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { clientIp } from "@/lib/rate-limit";
import { getDocumentDef } from "@/lib/cms/schema";
import { getEditorState, publishDocument } from "@/lib/cms/content-server";

export const runtime = "nodejs";

/**
 * Makes the saved draft live. A new version goes into history and the public
 * cache for this document is expired, so the next visitor sees the change.
 */
export const POST = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { key } = await (context as { params: Promise<{ key: string }> }).params;
  if (!getDocumentDef(key)) return fail(404, "صفحه پیدا نشد", "NOT_FOUND");

  const version = await publishDocument(key, admin, clientIp(request));
  if (version === null) return fail(409, "پیش‌نویسی برای انتشار وجود ندارد", "NO_DRAFT");

  return ok({ version, state: await getEditorState(key) });
});
