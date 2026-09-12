import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getI18n } from "@/lib/i18n";
import {
  getExpiringSubscriptions,
  getPlatformOverview,
  getPlatformRevenue,
} from "@/lib/admin";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { StatTile, TrendChart } from "@/components/charts";

export const metadata: Metadata = { title: "مدیریت پلتفرم", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Platform overview. Authorization is handled by the admin layout, which runs
 * requirePageAdmin() before any page in this folder renders.
 */
export default async function AdminOverviewPage() {
  const { t, locale } = await getI18n();

  const [overview, revenue, expiring] = await Promise.all([
    getPlatformOverview(),
    getPlatformRevenue(),
    getExpiringSubscriptions(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.admin.overview}</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label={t.admin.totalRestaurants}
          value={formatNumber(overview.totalRestaurants, locale)}
          icon={<Building2 className="size-4" />}
        />
        <StatTile
          label={t.admin.activeRestaurants}
          value={formatNumber(overview.activeRestaurants, locale)}
          tone="positive"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatTile
          label={t.admin.activeSubscriptions}
          value={formatNumber(overview.activeSubscriptions, locale)}
          icon={<CreditCard className="size-4" />}
        />
        <StatTile
          label={t.admin.expiringSoon}
          value={formatNumber(overview.expiringSoon, locale)}
          tone={overview.expiringSoon > 0 ? "negative" : "neutral"}
          icon={<Clock className="size-4" />}
        />
        <StatTile
          label={t.admin.totalPlatformRevenue}
          value={formatMoney(overview.totalRevenue, locale)}
          tone="brand"
          icon={<Wallet className="size-4" />}
        />
        <StatTile
          label={t.admin.monthlyRevenue}
          value={formatMoney(overview.monthlyRevenue, locale)}
          icon={<TrendingUp className="size-4" />}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.revenueOverTime}</CardTitle>
        </CardHeader>
        <CardBody>
          <TrendChart
            locale={locale}
            emptyLabel={t.analytics.noData}
            ariaLabel={t.admin.revenueOverTime}
            points={revenue.series.map((point) => ({
              label: point.label,
              value: point.revenue,
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.expiringTitle}</CardTitle>
          <Link
            href="/admin/expiring"
            className="text-xs font-bold text-brand-700 hover:underline"
          >
            {t.admin.expiringSoon}
          </Link>
        </CardHeader>

        {expiring.length === 0 ? (
          <EmptyState icon={<Clock className="size-6" />} title={t.admin.noExpiring} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs text-ink-500">
                  <th className="p-3 text-start font-semibold">{t.admin.restaurants}</th>
                  <th className="p-3 text-start font-semibold">{t.admin.plan}</th>
                  <th className="p-3 text-start font-semibold">{t.admin.expiresAt}</th>
                  <th className="p-3 text-start font-semibold">
                    {t.admin.daysRemaining}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {expiring.slice(0, 8).map((row) => (
                  <tr key={row.restaurantId}>
                    <td className="p-3 font-semibold">
                      <Link
                        href={`/admin/restaurants/${row.restaurantId}`}
                        className="hover:underline"
                      >
                        {row.restaurantName}
                      </Link>
                    </td>
                    <td className="p-3">{row.plan}</td>
                    <td className="p-3 tabular-nums">
                      {formatDate(row.currentPeriodEnd, locale)}
                    </td>
                    <td
                      className={`p-3 font-bold tabular-nums ${
                        row.daysRemaining < 0 ? "text-red-700" : "text-amber-700"
                      }`}
                    >
                      {row.daysRemaining < 0
                        ? t.admin.expired
                        : formatNumber(row.daysRemaining, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
