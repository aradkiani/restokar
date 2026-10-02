import { z } from "zod";
import { fail, ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { clientIp } from "@/lib/rate-limit";
import { getDocumentDef } from "@/lib/cms/schema";
import { getEditorState, listVersions, restoreVersion } from "@/lib/cms/content-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ key: string }> };

/** Every published version of a document, newest first. */
export const GET = route(async (_request: Request, context: unknown) => {
  await requireAdmin();
  const { key } = await (context as Context).params;
  if (!getDocumentDef(key)) return fail(404, "صفحه پیدا نشد", "NOT_FOUND");
  return ok(await listVersions(key));
});

const RestoreSchema = z.object({ version: z.number().int().min(1) });

/** Copies an earlier version into the draft, to be previewed and published. */
export const POST = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { key } = await (context as Context).params;
  if (!getDocumentDef(key)) return fail(404, "صفحه پیدا نشد", "NOT_FOUND");

  const { version } = await parseBody(request, RestoreSchema);
  const restored = await restoreVersion(key, version, admin, clientIp(request));
  if (!restored) return fail(404, "این نسخه پیدا نشد", "VERSION_NOT_FOUND");

  return ok(await getEditorState(key));
});
