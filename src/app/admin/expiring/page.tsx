import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { getExpiringSubscriptions } from "@/lib/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "اشتراک‌های رو به انقضا",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/** Widened to 30 days here: this page exists specifically for outreach. */
const LOOKAHEAD_DAYS = 30;

export default async function AdminExpiringPage() {
  const { t, locale } = await getI18n();
  const rows = await getExpiringSubscriptions(LOOKAHEAD_DAYS);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.admin.expiringTitle}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {formatNumber(LOOKAHEAD_DAYS, locale)} {t.report.days}
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Clock className="size-6" />} title={t.admin.noExpiring} />
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
                  <th className="p-3 text-start font-bold">{t.admin.plan}</th>
                  <th className="p-3 text-start font-bold">{t.subscription.status}</th>
                  <th className="p-3 text-start font-bold">{t.admin.expiresAt}</th>
                  <th className="p-3 text-start font-bold">{t.admin.daysRemaining}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <tr
                    key={row.restaurantId}
                    className="transition-colors hover:bg-ink-50"
                  >
                    <td className="p-3">
                      <Link
                        href={`/admin/restaurants/${row.restaurantId}`}
                        className="font-bold text-ink-900 hover:underline"
                      >
                        {row.restaurantName}
                      </Link>
                    </td>
                    <td className="p-3">{row.plan}</td>
                    <td className="p-3">
                      <Badge tone={row.status === "ACTIVE" ? "success" : "warning"}>
                        {t.subscription[
                          `status${row.status}` as keyof typeof t.subscription
                        ] ?? row.status}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatDate(row.currentPeriodEnd, locale)}
                    </td>
                    <td
                      className={`p-3 font-bold tabular-nums ${
                        row.daysRemaining < 0
                          ? "text-red-700"
                          : row.daysRemaining <= 7
                            ? "text-amber-700"
                            : "text-ink-700"
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
        </Card>
      )}
    </div>
  );
}
