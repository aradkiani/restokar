import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { draftMode } from "next/headers";
import { prisma } from "../prisma";
import { getSessionUser, type SessionUser } from "../auth/session";
import { recordAudit } from "../audit";
import { DOCUMENTS, getDocumentDef, pick, resolveDocument } from "./schema";
import { siteInfo, type SiteInfo } from "./site-info";
import { Prisma } from "@/generated/prisma/client";

/**
 * Reading and publishing the editable public content.
 *
 * Public pages read the *published* values through a per-document cache
 * tagged `cms:<key>`; publishing invalidates that tag immediately, so a change
 * is live on the next request without a redeploy. Production runs a single
 * Node process (see docs/LINUX-DEPLOY.md), which is what makes an in-process
 * tag enough; with several processes the invalidation would have to travel,
 * e.g. over the existing Postgres notify channel.
 *
 * Preview: when Next's draft mode is on *and* the visitor is the platform
 * admin, pages read the draft instead. Draft mode alone is a cookie anyone
 * could set, so it is never trusted by itself.
 */

const tagFor = (key: string) => `cms:${key}`;

function cachedPublished(key: string): Promise<Prisma.JsonValue | null> {
  return unstable_cache(
    async () => {
      const row = await prisma.contentDocument.findUnique({
        where: { key },
        select: { published: true },
      });
      return row?.published ?? null;
    },
    ["cms-published", key],
    { tags: [tagFor(key)] },
  )();
}

/** Whether this request is the admin previewing drafts. */
export async function isPreviewing(): Promise<boolean> {
  try {
    const { isEnabled } = await draftMode();
    if (!isEnabled) return false;
  } catch {
    return false;
  }
  const user = await getSessionUser();
  return user?.role === "SUPER_ADMIN";
}

/**
 * A document's values for rendering: published (or, for a previewing admin,
 * the draft) merged over the built-in defaults.
 */
export async function getContent(key: string): Promise<Record<string, unknown>> {
  const def = getDocumentDef(key);
  if (!def) throw new Error(`Unknown content document: ${key}`);

  if (await isPreviewing()) {
    const row = await prisma.contentDocument.findUnique({
      where: { key },
      select: { draft: true, published: true },
    });
    return resolveDocument(def, row?.draft ?? row?.published ?? null);
  }
  return resolveDocument(def, await cachedPublished(key));
}

/** The site settings, ready to render in one language. */
export async function getSiteInfo(locale: string): Promise<SiteInfo> {
  return siteInfo(await getContent("site"), locale);
}

/** The FAQ in one language; questions left empty are skipped. */
export async function getFaq(locale: string): Promise<{ q: string; a: string }[]> {
  const { items } = await getContent("faq");
  return (Array.isArray(items) ? items : [])
    .map((item: Record<string, unknown>) => ({
      q: pick(item.q, locale).trim(),
      a: pick(item.a, locale).trim(),
    }))
    .filter((item) => item.q && item.a);
}

// --------------------------------------------------------------- admin side

export interface EditorState {
  key: string;
  /** What the editor should show: the draft if there is one, else what is live. */
  values: Record<string, unknown>;
  hasDraft: boolean;
  version: number;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
}

export async function getEditorState(key: string): Promise<EditorState> {
  const def = getDocumentDef(key);
  if (!def) throw new Error(`Unknown content document: ${key}`);
  const row = await prisma.contentDocument.findUnique({ where: { key } });
  return {
    key,
    values: resolveDocument(def, row?.draft ?? row?.published ?? null, "edit"),
    hasDraft: row?.draft != null,
    version: row?.version ?? 0,
    draftUpdatedAt: row?.draftUpdatedAt?.toISOString() ?? null,
    publishedAt: row?.publishedAt?.toISOString() ?? null,
  };
}

export async function documentStatuses() {
  const rows = await prisma.contentDocument.findMany({
    select: {
      key: true,
      draft: true,
      version: true,
      publishedAt: true,
      draftUpdatedAt: true,
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return DOCUMENTS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      group: def.group,
      previewPath: def.previewPath,
      version: row?.version ?? 0,
      hasDraft: row?.draft != null,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      draftUpdatedAt: row?.draftUpdatedAt?.toISOString() ?? null,
    };
  });
}

export async function saveDraft(
  key: string,
  data: Record<string, unknown>,
  user: SessionUser,
) {
  await prisma.contentDocument.upsert({
    where: { key },
    create: {
      key,
      draft: data as Prisma.InputJsonValue,
      draftUpdatedAt: new Date(),
      draftUpdatedBy: user.id,
    },
    update: {
      draft: data as Prisma.InputJsonValue,
      draftUpdatedAt: new Date(),
      draftUpdatedBy: user.id,
    },
  });
}

export async function discardDraft(key: string) {
  await prisma.contentDocument.updateMany({
    where: { key },
    data: { draft: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedBy: null },
  });
}

/**
 * Makes the draft live: a new version is written to history, the draft is
 * cleared, the cache tag is expired so the next public request reads it.
 * Returns the new version number, or null when there was nothing to publish.
 */
export async function publishDocument(
  key: string,
  user: SessionUser,
  ip: string | null,
): Promise<number | null> {
  const def = getDocumentDef(key);
  if (!def) throw new Error(`Unknown content document: ${key}`);

  const version = await prisma.$transaction(async (tx) => {
    const row = await tx.contentDocument.findUnique({ where: { key } });
    if (!row || row.draft == null) return null;
    const next = row.version + 1;
    await tx.contentDocument.update({
      where: { key },
      data: {
        published: row.draft as Prisma.InputJsonValue,
        draft: Prisma.DbNull,
        version: next,
        publishedAt: new Date(),
        publishedBy: user.id,
      },
    });
    await tx.contentVersion.create({
      data: {
        documentKey: key,
        version: next,
        data: row.draft as Prisma.InputJsonValue,
        publishedBy: user.id,
      },
    });
    return next;
  });

  if (version !== null) {
    // Immediate expiry rather than stale-while-revalidate: the admin pressed
    // publish and expects the next visitor to see it.
    revalidateTag(tagFor(key), { expire: 0 });
    await recordAudit({
      actor: user,
      restaurantId: null,
      action: "CONTENT_PUBLISHED",
      summary: `«${def.title}» منتشر شد (نسخهٔ ${version.toLocaleString("fa-IR")})`,
      entityType: "ContentDocument",
      entityId: key,
      metadata: { version },
      ip,
    });
  }
  return version;
}

export async function listVersions(key: string) {
  const rows = await prisma.contentVersion.findMany({
    where: { documentKey: key },
    orderBy: { version: "desc" },
    take: 50,
    select: { version: true, publishedAt: true, publishedBy: true, restoredFrom: true },
  });
  const actors = await prisma.user.findMany({
    where: {
      id: { in: rows.map((r) => r.publishedBy).filter((id): id is string => !!id) },
    },
    select: { id: true, name: true },
  });
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((row) => ({
    version: row.version,
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedBy ? (nameOf.get(row.publishedBy) ?? null) : null,
    restoredFrom: row.restoredFrom,
  }));
}

/**
 * Copies an earlier version into the draft. Never straight to live: the admin
 * previews it and publishes like any other edit.
 */
export async function restoreVersion(
  key: string,
  version: number,
  user: SessionUser,
  ip: string | null,
): Promise<boolean> {
  const def = getDocumentDef(key);
  if (!def) throw new Error(`Unknown content document: ${key}`);
  const found = await prisma.contentVersion.findUnique({
    where: { documentKey_version: { documentKey: key, version } },
    select: { data: true },
  });
  if (!found) return false;
  await saveDraft(key, found.data as Record<string, unknown>, user);
  await recordAudit({
    actor: user,
    restaurantId: null,
    action: "CONTENT_RESTORED",
    summary: `نسخهٔ ${version.toLocaleString("fa-IR")} از «${def.title}» به پیش‌نویس برگردانده شد`,
    entityType: "ContentDocument",
    entityId: key,
    metadata: { version },
    ip,
  });
  return true;
}
