import { fail, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getDocumentDef, validateDocument } from "@/lib/cms/schema";
import { discardDraft, getEditorState, saveDraft } from "@/lib/cms/content-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ key: string }> };

/** One editable document: what the editor shows (the draft, or what is live). */
export const GET = route(async (_request: Request, context: unknown) => {
  await requireAdmin();
  const { key } = await (context as Context).params;
  if (!getDocumentDef(key)) return fail(404, "صفحه پیدا نشد", "NOT_FOUND");
  return ok(await getEditorState(key));
});

/**
 * Saves the draft. Nothing changes on the public site until it is published.
 * Every value is cleaned and checked against the document's schema first;
 * unknown fields are dropped.
 */
export const PUT = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { key } = await (context as Context).params;
  const def = getDocumentDef(key);
  if (!def) return fail(404, "صفحه پیدا نشد", "NOT_FOUND");

  const limit = await rateLimit(`admin:content:${admin.id}:${clientIp(request)}`, {
    limit: 120,
    windowSeconds: 300,
  });
  if (!limit.allowed) return fail(429, "Too many attempts", "RATE_LIMITED");

  const body = (await request.json().catch(() => null)) as { values?: unknown } | null;
  const { data, errors } = validateDocument(def, body?.values);
  if (Object.keys(errors).length > 0) {
    return fail(422, "بعضی از فیلدها نیاز به اصلاح دارند", "VALIDATION_ERROR", errors);
  }

  await saveDraft(key, data, admin);
  return ok(await getEditorState(key));
});

/** Throws the draft away; the live version is untouched. */
export const DELETE = route(async (_request: Request, context: unknown) => {
  await requireAdmin();
  const { key } = await (context as Context).params;
  if (!getDocumentDef(key)) return fail(404, "صفحه پیدا نشد", "NOT_FOUND");
  await discardDraft(key);
  return ok(await getEditorState(key));
});
