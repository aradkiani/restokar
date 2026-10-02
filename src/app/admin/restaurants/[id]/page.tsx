import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { getRestaurantForAdmin } from "@/lib/admin";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ExtendSubscriptionForm } from "./extend-form";

export const metadata: Metadata = { title: "جزئیات رستوران", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminRestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale, dir } = await getI18n();
  const { id } = await params;

  const restaurant = await getRestaurantForAdmin(id);
  if (!restaurant) notFound();

  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const subscription = restaurant.subscription;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/restaurants"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-600 hover:text-ink-900"
      >
        <Back className="size-4" />
        {t.admin.backToList}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-ink-900">
            {restaurant.name}
            {restaurant.isDemo && <Badge tone="info">{t.admin.demoBadge}</Badge>}
            {!restaurant.isActive && <Badge tone="danger">{t.common.inactive}</Badge>}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-500" dir="ltr">
            /menu/{restaurant.slug}
          </p>
        </div>

        <Link
          href={`/menu/${restaurant.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-surface px-4 py-2 text-sm font-bold text-ink-800 hover:border-ink-400"
        >
          {t.dashboard.viewMenu}
          <ExternalLink className="size-4" />
        </Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.accountInfo}</CardTitle>
          </CardHeader>
          <CardBody>
            <Rows
              rows={[
                [t.admin.owner, restaurant.owner.name],
                [t.auth.phone, restaurant.owner.phone ?? "—"],
                [t.admin.joinedAt, formatDate(restaurant.createdAt, locale)],
                [t.settings.phone, restaurant.phone ?? "—"],
                [t.design.template, restaurant.templateId],
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.subscriptionDetails}</CardTitle>
          </CardHeader>
          <CardBody>
            {subscription ? (
              <Rows
                rows={[
                  [t.admin.plan, subscription.plan.name],
                  [
                    t.subscription.status,
                    t.subscription[
                      `status${subscription.status}` as keyof typeof t.subscription
                    ] ?? subscription.status,
                  ],
                  [
                    t.subscription.monthly,
                    formatMoney(subscription.plan.monthlyPrice, locale),
                  ],
                  [t.admin.expiresAt, formatDate(subscription.currentPeriodEnd, locale)],
                ]}
              />
            ) : (
              <p className="text-sm text-ink-500">—</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.revenue}</CardTitle>
          </CardHeader>
          <CardBody>
            <Rows
              rows={[
                [
                  t.admin.platformRevenueCol,
                  formatMoney(restaurant.platformRevenue, locale),
                ],
                [t.admin.ownRevenue, formatMoney(restaurant.ownRevenue, locale)],
                [t.admin.orderCount, formatNumber(restaurant.orderCount, locale)],
                [t.admin.products, formatNumber(restaurant._count.products, locale)],
              ]}
            />
          </CardBody>
        </Card>
      </section>

      {subscription && (
        <ExtendSubscriptionForm
          restaurantId={restaurant.id}
          currentExpiration={subscription.currentPeriodEnd.toISOString()}
          locale={locale}
        />
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.subscriptionHistory}</CardTitle>
          </CardHeader>
          {!subscription || subscription.extensions.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-500">{t.admin.noExtensions}</p>
            </CardBody>
          ) : (
            <div className="divide-y divide-ink-100">
              {subscription.extensions.map((extension) => (
                <div key={extension.id} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={extension.extensionType === "GIFT" ? "info" : "success"}>
                      {extension.extensionType === "GIFT"
                        ? t.admin.giftBadge
                        : t.admin.manualBadge}
                    </Badge>
                    <span className="text-sm font-bold tabular-nums">
                      +{formatNumber(extension.durationDays, locale)} {t.report.days}
                    </span>
                    <span className="ms-auto text-xs text-ink-500">
                      {formatDateTime(extension.createdAt, locale)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-700">{extension.reason}</p>
                  <p className="mt-1 text-xs text-ink-500 tabular-nums">
                    {formatDate(extension.previousExpiration, locale)} →{" "}
                    {formatDate(extension.newExpiration, locale)} · {t.admin.performedBy}{" "}
                    <span dir="ltr">{extension.adminLabel}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.paymentHistory}</CardTitle>
          </CardHeader>
          {!subscription || subscription.payments.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-500">{t.subscription.noPayments}</p>
            </CardBody>
          ) : (
            <div className="divide-y divide-ink-100">
              {subscription.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center gap-2 p-3.5 text-sm"
                >
                  <span className="font-bold tabular-nums">
                    {formatMoney(payment.amount, locale)}
                  </span>
                  <Badge tone={payment.status === "PAID" ? "success" : "neutral"}>
                    {payment.status}
                  </Badge>
                  <span className="ms-auto text-xs text-ink-500 tabular-nums">
                    {formatDate(payment.createdAt, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-3 border-b border-ink-100 pb-2"
        >
          <dt className="text-ink-500">{label}</dt>
          <dd className="truncate font-semibold" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
