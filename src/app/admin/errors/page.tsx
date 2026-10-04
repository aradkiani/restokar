import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getI18n } from "@/lib/i18n";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ResolveButton } from "./resolve-button";

export const metadata: Metadata = { title: "خطاها" };
export const dynamic = "force-dynamic";

const FILTERS = ["open", "resolved", "all"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * What broke on the platform, most recent first.
 *
 * No guard here: `/admin/layout.tsx` runs `requirePageAdmin()` for every page
 * in this folder. The log reads across tenants by nature — a server error has
 * no venue — which is why it lives here and not in the dashboard.
 */
export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { show } = await searchParams;
  const filter: Filter = FILTERS.includes(show as Filter) ? (show as Filter) : "open";
  const a = t.admin;

  const rows = await prisma.errorEvent.findMany({
    where:
      filter === "open"
        ? { resolvedAt: null }
        : filter === "resolved"
          ? { resolvedAt: { not: null } }
          : {},
    orderBy: { lastSeenAt: "desc" },
    take: 200,
  });

  const label: Record<Filter, string> = {
    open: a.errorOpen,
    resolved: a.errorResolved,
    all: a.errorAll,
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{a.errorLog}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">{a.errorLogHint}</p>
      </header>

      <nav aria-label={a.errorLog} className="flex gap-1">
        {FILTERS.map((key) => (
          <Link
            key={key}
            href={key === "open" ? "/admin/errors" : `/admin/errors?show=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold",
              filter === key ? "bg-ink-900 text-ink-50" : "bg-ink-100 text-ink-600",
            )}
          >
            {label[key]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-ink-300 p-8 text-center text-sm text-ink-500">
          {a.errorNone}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-[var(--radius-md)] border border-ink-200 bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-ink-500">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5",
                        row.source === "SERVER"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {row.source === "SERVER" ? a.errorServer : a.errorClient}
                    </span>
                    {row.context && <span>{row.context}</span>}
                    {row.method && <span dir="ltr">{row.method}</span>}
                    {row.path && (
                      <span dir="ltr" className="font-mono">
                        {row.path}
                      </span>
                    )}
                  </p>
                  <p
                    dir="auto"
                    className="mt-1.5 text-sm font-bold break-words text-ink-900"
                  >
                    {row.message}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {a.errorCount.replace("{count}", formatNumber(row.count, locale))} ·{" "}
                    {a.errorLastSeen}: {formatDateTime(row.lastSeenAt, locale)} ·{" "}
                    {a.errorFirstSeen}: {formatDateTime(row.firstSeenAt, locale)}
                  </p>
                </div>
                <ResolveButton id={row.id} resolved={row.resolvedAt !== null} />
              </div>
              {(row.stack || row.digest || row.userAgent) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-bold text-ink-600">
                    {a.errorStack}
                  </summary>
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-72 overflow-auto rounded-md bg-ink-50 p-3 text-[11px] leading-5 whitespace-pre-wrap text-ink-700"
                  >
                    {[row.digest && `digest: ${row.digest}`, row.userAgent, row.stack]
                      .filter(Boolean)
                      .join("\n\n")}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
