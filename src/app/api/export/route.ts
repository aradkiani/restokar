import { route } from "@/lib/api";
import { HttpError, requireOwner, requireTab } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getI18n } from "@/lib/i18n";
import { ExportQuerySchema } from "@/lib/validation";
import { exportFilename, toCsv } from "@/lib/export/csv";
import {
  SENSITIVE_DATASETS,
  buildExport,
  exportDayKey,
  type ExportDataset,
} from "@/lib/export/datasets";

export const runtime = "nodejs";

/**
 * One endpoint for every export.
 *
 * A single route rather than one per dataset, because the differences between
 * them are entirely in *what rows to build* — the authentication, the tenant
 * resolution, the rate limiting, the CSV encoding, the filename and the
 * download headers are identical, and eight copies of that is eight places for
 * one of them to drift.
 *
 * ### Tenant
 *
 * `restaurantId` comes from the guard, which reads the session. There is no
 * `restaurantId` parameter in `ExportQuerySchema`, so there is nothing for a
 * caller to point at another venue — the same rule as every other tenant query
 * in this codebase.
 *
 * ### Permission
 *
 * Two levels, decided by the dataset rather than by a flag in the request:
 *
 *   * **`customers`** requires ownership. It carries guests' phone numbers,
 *     which is the most personal data the platform holds, and the customer
 *     screen it projects is already owner-only. A staff member with the
 *     `analytics` grant must not be able to take the customer list out through
 *     a different door.
 *   * **Everything else** requires the `analytics` grant — the same grant that
 *     opens the reports these files project. Someone who can read a figure on
 *     screen can have it in a spreadsheet; that is the point of the feature.
 *
 * ### Read-only
 *
 * Nothing here writes to business data. The only write is the audit entry, and
 * it is about the export rather than part of it.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const query = ExportQuerySchema.parse(Object.fromEntries(url.searchParams));
  const dataset = query.dataset as ExportDataset;

  /*
    The guard is chosen before anything is read, so an unauthorised caller never
    reaches a query. `requireOwner` throws a 403 the route wrapper turns into
    the platform's standard error body.
  */
  const { restaurantId, user } = SENSITIVE_DATASETS.has(dataset)
    ? await requireOwner()
    : await requireTab("analytics");

  /*
    The platform's existing limiter, not a new one.

    Keyed per user *and* dataset: building one of these is a real query, and a
    held-down download button should not be able to run twenty of them. Ten an
    hour is far above any honest use and far below anything that could hurt.
  */
  const limit = await rateLimit(`export:${dataset}:${user.id}`, {
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    throw new HttpError(429, "Too many export requests", "RATE_LIMITED");
  }

  const { t } = await getI18n();

  /*
    The window, resolved exactly as every report resolves it.

    `days` is the rolling window the dashboards use; `from`/`to` is the explicit
    range the report generator uses. Both go through `resolveRange` inside
    `buildExport`, so "the last 30 days" means the same 30 trading days in a
    file as on a screen.
  */
  const window =
    query.from && query.to ? { from: query.from, to: query.to } : (query.days ?? 30);

  const { headers, rows } = await buildExport(dataset, restaurantId, window, t);

  /*
    An empty period is refused rather than delivered as a header-only file.

    A spreadsheet containing nothing but column names reads as "the export is
    broken", and an owner cannot tell it apart from one. Saying so plainly is
    the more useful answer, and the client turns this code into the sentence.
  */
  if (rows.length === 0) {
    throw new HttpError(404, t.exports.empty, "EXPORT_EMPTY");
  }

  const venue = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { slug: true },
  });

  /*
    Who took a copy of the customer list, and how much of it.

    Only the sensitive dataset is logged. Recording every sales export would
    bury the one entry that matters in a log an owner actually reads, and
    `recordAudit` never throws — a lost log line must not cost the owner their
    download.
  */
  if (SENSITIVE_DATASETS.has(dataset)) {
    await recordAudit({
      actor: user,
      restaurantId,
      action: "DATA_EXPORTED",
      summary: `${t.exports.datasets[dataset]} — ${rows.length}`,
      entityType: "export",
      entityId: dataset,
      metadata: { dataset, rows: rows.length },
      ip: clientIp(request),
    });
  }

  const filename = exportFilename(dataset, venue.slug, exportDayKey());

  return new Response(toCsv(headers, rows), {
    headers: {
      /*
        `charset=utf-8` alongside the byte-order mark the CSV already carries.
        Belt and braces: the header tells a browser, the mark tells Excel, and
        Persian product names need both to survive the round trip.
      */
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      /*
        Never cached, anywhere.

        This is per-tenant business data behind a session cookie, and a shared
        cache that keyed on the URL alone would serve one restaurant's revenue
        to another. The URL is identical for every venue — only the cookie
        differs — so this header is the whole defence.
      */
      "cache-control": "no-store, private",
    },
  });
});
