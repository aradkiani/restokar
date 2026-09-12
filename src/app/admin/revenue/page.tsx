import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import { getPlatformRevenue } from "@/lib/admin";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile, TrendChart } from "@/components/charts";

export const metadata: Metadata = { title: "درآمد پلتفرم", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminRevenuePage() {
  const { t, locale } = await getI18n();
  const revenue = await getPlatformRevenue();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.admin.revenueTitle}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {/* Stated explicitly because it is the most common misreading of this
              screen: gifted extensions never appear here. */}
          {t.admin.totalPlatformRevenue}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t.admin.totalPlatformRevenue}
          value={formatMoney(revenue.total, locale)}
          tone="brand"
        />
        <StatTile
          label={t.admin.monthlyRevenue}
          value={formatMoney(revenue.thisMonth, locale)}
        />
        <StatTile
          label={t.admin.lastThreeMonths}
          value={formatMoney(revenue.lastThreeMonths, locale)}
        />
        <StatTile
          label={t.admin.thisYear}
          value={formatMoney(revenue.thisYear, locale)}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label={t.admin.activeSubscriptions}
          value={formatNumber(revenue.activeSubscriptions, locale)}
          tone="positive"
        />
        <StatTile
          label={t.admin.expiredSubscriptions}
          value={formatNumber(revenue.expiredSubscriptions, locale)}
          tone="negative"
        />
        <StatTile
          label={t.admin.totalRestaurants}
          value={formatNumber(revenue.totalRestaurants, locale)}
        />
        <StatTile
          label={t.admin.payingRestaurants}
          value={formatNumber(revenue.payingRestaurants, locale)}
        />
        <StatTile
          label={t.admin.avgRevenuePerRestaurant}
          value={formatMoney(revenue.averageRevenuePerPayingRestaurant, locale)}
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
    </div>
  );
}
