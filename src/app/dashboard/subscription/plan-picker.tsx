"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

export interface PlanOption {
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  maxProducts: number;
  maxCategories: number;
  maxTables: number;
  maxDailyViews: number;
  allowsOnlinePay: boolean;
  allowsAnalytics: boolean;
  sortOrder: number;
}

export function PlanPicker({
  plans,
  currentPlanCode,
  locale,
}: {
  plans: PlanOption[];
  currentPlanCode: string | null;
  locale: Locale;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [interval, setInterval] = React.useState<"monthly" | "yearly">("monthly");
  const [busyCode, setBusyCode] = React.useState<string | null>(null);

  async function checkout(planCode: string) {
    setBusyCode(planCode);

    const result = await api.post<{ paymentUrl: string }>("/api/subscription/checkout", {
      planCode,
      interval,
    });

    if (!result.ok) {
      setBusyCode(null);
      toast.error(result.error.message);
      return;
    }

    // Full navigation, not a router push — the payment gateway is a different
    // origin, which Next's router cannot reach.
    //
    // react-hooks/immutability targets writes to module-scope variables; it
    // does not distinguish those from browser navigation APIs. There is no
    // alternative construct here, so the rule is suppressed at this one line
    // rather than the code being reshaped around a false positive.
    // eslint-disable-next-line react-hooks/immutability
    window.location.href = result.data.paymentUrl;
  }

  const limitLabel = (value: number, unit: string) =>
    value < 0 ? t.subscription.unlimited : `${formatNumber(value, locale)} ${unit}`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-ink-900">{t.subscription.changePlan}</h2>

        <div className="flex gap-1 rounded-full bg-ink-100 p-1">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              aria-pressed={interval === value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                interval === value
                  ? "bg-surface text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              {value === "monthly" ? t.subscription.monthly : t.subscription.yearly}
            </button>
          ))}
        </div>
      </div>

      {interval === "yearly" && (
        <p className="text-center text-xs font-bold text-emerald-700">
          {t.subscription.yearlyDiscount}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan, index) => {
          const isCurrent = plan.code === currentPlanCode;
          const price = interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
          // The middle tier is the intended default — highlight it.
          const highlighted = index === 1;

          return (
            <div
              key={plan.code}
              className={cn(
                "relative flex flex-col rounded-[var(--radius-lg)] border p-5",
                highlighted
                  ? "border-brand-400 bg-surface shadow-[var(--shadow-lift)] ring-2 ring-brand-500/20"
                  : "border-ink-200 bg-surface shadow-[var(--shadow-soft)]",
              )}
            >
              {highlighted && (
                <span className="absolute start-1/2 -top-3 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-black text-white">
                  {t.subscription.popular}
                </span>
              )}

              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-black text-ink-900">{plan.name}</h3>
                {isCurrent && <Badge tone="brand">{t.subscription.currentBadge}</Badge>}
              </div>

              {plan.description && (
                <p className="mt-1.5 text-xs leading-6 text-ink-500">
                  {plan.description}
                </p>
              )}

              <p className="mt-4">
                <span className="text-2xl font-black text-ink-900">
                  {formatMoney(price, locale)}
                </span>
                <span className="ms-1.5 text-xs font-semibold text-ink-500">
                  {t.common.toman} /{" "}
                  {interval === "yearly"
                    ? t.subscription.perYear
                    : t.subscription.perMonth}
                </span>
              </p>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {[
                  limitLabel(plan.maxProducts, t.subscription.limitProducts),
                  limitLabel(plan.maxCategories, t.subscription.limitCategories),
                  limitLabel(plan.maxTables, t.subscription.limitTables),
                  limitLabel(plan.maxDailyViews, t.subscription.limitDailyViews),
                  plan.allowsAnalytics ? t.dashboard.analytics : null,
                  plan.allowsOnlinePay ? t.features.paymentTitle : null,
                ]
                  .filter(Boolean)
                  .map((feature) => (
                    <li
                      key={feature as string}
                      className="flex items-start gap-2 text-ink-700"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      {feature}
                    </li>
                  ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={highlighted ? "primary" : "outline"}
                loading={busyCode === plan.code}
                onClick={() => checkout(plan.code)}
              >
                {isCurrent ? t.subscription.renew : t.subscription.choosePlan}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
