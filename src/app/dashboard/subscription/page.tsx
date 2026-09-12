import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getSubscriptionState } from "@/lib/plans";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { SUBSCRIPTION_CHECKOUT_ENABLED } from "@/lib/features";
import { CONTACT } from "@/lib/constants";
import { PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "اشتراک" };
export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; ref?: string }>;
}) {
  const { restaurantId } = await requirePageOwner("/dashboard/subscription");
  const { t, locale } = await getI18n();
  const { payment, ref } = await searchParams;

  const [state, plans, payments] = await Promise.all([
    getSubscriptionState(restaurantId),
    prisma.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }),
    prisma.payment.findMany({
      where: { restaurantId, purpose: "SUBSCRIPTION" },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const statusLabels: Record<string, string> = {
    TRIALING: t.subscription.statusTRIALING,
    ACTIVE: t.subscription.statusACTIVE,
    PAST_DUE: t.subscription.statusPAST_DUE,
    CANCELED: t.subscription.statusCANCELED,
    EXPIRED: t.subscription.statusEXPIRED,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.subscription.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.subscription.subtitle}</p>
      </header>

      {payment === "success" && (
        <p
          role="status"
          className="rounded-[var(--radius-md)] bg-emerald-50 p-4 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200"
        >
          {t.payment.success}
          {ref && ` — ${t.payment.refId}: ${ref}`}
        </p>
      )}
      {payment === "failed" && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-red-50 p-4 text-sm font-bold text-red-800 ring-1 ring-red-200"
        >
          {t.payment.failed}
        </p>
      )}

      {state && (
        <Card>
          <CardHeader>
            <CardTitle>{t.subscription.currentPlan}</CardTitle>
            <Badge
              tone={
                state.isExpired
                  ? "danger"
                  : state.status === "TRIALING"
                    ? "info"
                    : state.status === "ACTIVE"
                      ? "success"
                      : "warning"
              }
            >
              {statusLabels[state.status] ?? state.status}
            </Badge>
          </CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-ink-500">
                  {t.subscription.currentPlan}
                </p>
                <p className="mt-1 text-lg font-black text-ink-900">{state.planName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-500">
                  {state.isExpired ? t.subscription.expiresOn : t.subscription.renewsOn}
                </p>
                <p className="mt-1 text-lg font-black text-ink-900">
                  {formatDate(state.currentPeriodEnd, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-500">
                  {t.subscription.daysLeft}
                </p>
                <p
                  className={`mt-1 text-lg font-black tabular-nums ${
                    state.isExpired ? "text-red-700" : "text-ink-900"
                  }`}
                >
                  {formatNumber(Math.max(0, state.daysLeft), locale)}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/*
        The picker is the entry point to checkout, so while the gateway is off
        it is replaced rather than merely disabled — a grid of plans with dead
        buttons invites the owner to keep trying. The card below tells them how
        renewal actually happens right now.
      */}
      {!SUBSCRIPTION_CHECKOUT_ENABLED ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.landing.paymentsPausedTitle}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm leading-7 text-ink-600">
              {t.landing.paymentsPausedBody}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-ink-800">
              <a href={CONTACT.phoneHref} className="inline-flex min-h-11 items-center">
                <span dir="ltr">{CONTACT.phone}</span>
              </a>
              <a
                href={`mailto:${CONTACT.email}`}
                className="inline-flex min-h-11 items-center"
              >
                <span dir="ltr">{CONTACT.email}</span>
              </a>
            </div>
          </CardBody>
        </Card>
      ) : (
        <PlanPicker
          locale={locale}
          currentPlanCode={state?.planCode ?? null}
          plans={plans.map((plan) => ({
            code: plan.code,
            name: locale === "en" ? plan.nameEn : plan.name,
            description: plan.description,
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
            maxProducts: plan.maxProducts,
            maxCategories: plan.maxCategories,
            maxDailyViews: plan.maxDailyViews,
            maxTables: plan.maxTables,
            allowsOnlinePay: plan.allowsOnlinePay,
            allowsAnalytics: plan.allowsAnalytics,
            sortOrder: plan.sortOrder,
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.subscription.paymentHistory}</CardTitle>
        </CardHeader>

        {payments.length === 0 ? (
          <CardBody>
            <p className="py-6 text-center text-sm text-ink-500">
              {t.subscription.noPayments}
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs text-ink-500">
                  <th className="p-3 text-start font-semibold">{t.payment.amount}</th>
                  <th className="p-3 text-start font-semibold">
                    {t.subscription.status}
                  </th>
                  <th className="p-3 text-start font-semibold">{t.payment.refId}</th>
                  <th className="p-3 text-start font-semibold">
                    {t.orderStatus.placedAt}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {payments.map((item) => (
                  <tr key={item.id}>
                    <td className="p-3 font-semibold tabular-nums">
                      {formatMoney(item.amount, locale)}
                    </td>
                    <td className="p-3">
                      <Badge
                        tone={
                          item.status === "PAID"
                            ? "success"
                            : item.status === "FAILED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs" dir="ltr">
                      {item.refId ?? "—"}
                    </td>
                    <td className="p-3 text-ink-500">
                      {formatDate(item.createdAt, locale)}
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
