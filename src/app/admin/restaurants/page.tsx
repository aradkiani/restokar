import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { listRestaurantsForAdmin } from "@/lib/admin";
import { AdminRestaurantQuerySchema } from "@/lib/validation";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { RestaurantFilters } from "./filters";

export const metadata: Metadata = { title: "رستوران‌ها", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_TONE = {
  ACTIVE: "success",
  TRIALING: "info",
  PAST_DUE: "warning",
  CANCELED: "neutral",
  EXPIRED: "danger",
} as const;

export default async function AdminRestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t, locale } = await getI18n();
  const raw = await searchParams;

  // A malformed filter falls back to defaults rather than erroring — these
  // arrive from bookmarked URLs.
  const parsed = AdminRestaurantQuerySchema.safeParse({
    search: raw.search,
    status: raw.status,
    plan: raw.plan,
    sort: raw.sort,
    direction: raw.direction,
    registeredAfter: raw.registeredAfter,
  });
  const query = parsed.success ? parsed.data : AdminRestaurantQuerySchema.parse({});

  const [rows, plans] = await Promise.all([
    listRestaurantsForAdmin({
      search: query.search,
      status: query.status,
      plan: query.plan,
      sort: query.sort,
      direction: query.direction,
      registeredAfter: query.registeredAfter
        ? new Date(`${query.registeredAfter}T00:00:00`)
        : undefined,
    }),
    prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-black text-ink-900">{t.admin.restaurants}</h1>
        <p className="text-sm text-ink-500">
          {formatNumber(rows.length, locale)} {t.admin.restaurants}
        </p>
      </header>

      <RestaurantFilters plans={plans} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="size-6" />} title={t.admin.noResults} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-xs text-ink-600">
                  <th className="p-3 text-start font-bold">
                    {t.settings.restaurantName}
                  </th>
                  <th className="p-3 text-start font-bold">{t.admin.owner}</th>
                  <th className="p-3 text-start font-bold">{t.admin.joinedAt}</th>
                  <th className="p-3 text-start font-bold">{t.admin.plan}</th>
                  <th className="p-3 text-start font-bold">{t.subscription.status}</th>
                  <th className="p-3 text-start font-bold">{t.admin.expiresAt}</th>
                  <th className="p-3 text-start font-bold">
                    {t.admin.platformRevenueCol}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-ink-50">
                    <td className="p-3">
                      <Link
                        href={`/admin/restaurants/${row.id}`}
                        className="font-bold text-ink-900 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className="block font-mono text-[11px] text-ink-500"
                          dir="ltr"
                        >
                          /{row.slug}
                        </span>
                        {row.isDemo && <Badge tone="info">{t.admin.demoBadge}</Badge>}
                        {!row.isActive && (
                          <Badge tone="danger">{t.common.inactive}</Badge>
                        )}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="block font-semibold">{row.owner.name}</span>
                      <span className="block text-[11px] text-ink-500" dir="ltr">
                        {row.owner.phone}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatDate(row.createdAt, locale)}
                    </td>
                    <td className="p-3">{row.plan ?? "—"}</td>
                    <td className="p-3">
                      {row.subscriptionStatus ? (
                        <Badge
                          tone={
                            STATUS_TONE[
                              row.subscriptionStatus as keyof typeof STATUS_TONE
                            ] ?? "neutral"
                          }
                        >
                          {t.subscription[
                            `status${row.subscriptionStatus}` as keyof typeof t.subscription
                          ] ?? row.subscriptionStatus}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 tabular-nums">
                      {row.currentPeriodEnd
                        ? formatDate(row.currentPeriodEnd, locale)
                        : "—"}
                    </td>
                    <td className="p-3 font-bold tabular-nums">
                      {formatMoney(row.platformRevenue, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
