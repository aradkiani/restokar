import Link from "next/link";
import { Check } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { effectivePrice, type PlanPricing } from "@/lib/plan-terms";
import { planLines } from "@/lib/plan-features";
import { cn } from "@/lib/utils";

export interface PublicPlan extends PlanPricing {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  description: string | null;
  descriptionEn: string | null;
  maxTables: number;
  maxDailyViews: number;
  isContractPriced: boolean;
  isRecommended: boolean;
  features: unknown;
}

/**
 * The plan cards, as the homepage and the pricing page both show them.
 *
 * Everything on a card comes from the plan row: price (with a promotion when
 * one is running), the «پیشنهاد ما» badge, the feature lines. Listed tiers sit
 * in a row; a contract-priced tier sits centred beneath them, because a "from"
 * price read left to right looks like the next step of the same ladder.
 */
export function PlanGrid({
  plans,
  t,
  locale,
  ctaLabel,
  heading: Heading = "h2",
  now = new Date(),
}: {
  plans: PublicPlan[];
  t: Dictionary;
  locale: Locale;
  ctaLabel: string;
  heading?: "h2" | "h3";
  now?: Date;
}) {
  const listed = plans.filter((plan) => !plan.isContractPriced);
  const contract = plans.filter((plan) => plan.isContractPriced);

  function card(plan: PublicPlan) {
    const recommended = plan.isRecommended && !plan.isContractPriced;
    const monthly = effectivePrice(plan, "monthly", now);
    const yearly = effectivePrice(plan, "yearly", now);
    const description =
      locale === "en" ? plan.descriptionEn || plan.description : plan.description;

    const lines = planLines(plan, t, locale);

    return (
      <section
        key={plan.id}
        aria-label={locale === "en" ? plan.nameEn : plan.name}
        className={cn(
          "relative flex flex-col rounded-[var(--radius-lg)] border bg-surface p-6",
          recommended
            ? "border-brand-400 shadow-[var(--shadow-lift)] ring-2 ring-brand-500/20 md:-my-3"
            : plan.isContractPriced
              ? "mx-auto mt-5 w-full max-w-md border-ink-300 shadow-[var(--shadow-soft)] sm:max-w-lg"
              : "border-ink-200 shadow-[var(--shadow-soft)]",
        )}
      >
        {recommended && (
          <span className="absolute start-1/2 -top-3 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-black whitespace-nowrap text-white">
            {t.subscription.popular}
          </span>
        )}

        <Heading className="text-lg font-black text-ink-900">
          {locale === "en" ? plan.nameEn : plan.name}
        </Heading>
        {description && (
          <p className="mt-1.5 text-xs leading-6 text-ink-500">{description}</p>
        )}

        <p className="mt-5">
          {plan.isContractPriced && (
            <span className="me-1.5 text-xs font-semibold text-ink-500">
              {t.subscription.priceFrom}
            </span>
          )}
          {monthly.regular !== null && (
            <s className="me-2 text-base font-bold text-ink-400">
              {formatMoney(monthly.regular, locale)}
            </s>
          )}
          <span className="text-3xl font-black text-ink-900">
            {formatMoney(monthly.amount, locale)}
          </span>
          <span className="ms-1.5 text-xs font-semibold text-ink-500">
            {t.common.toman} / {t.subscription.perMonth}
          </span>
        </p>
        {plan.isContractPriced ? (
          <p className="mt-1 text-xs text-ink-500">{t.subscription.contractNote}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-500">
            {t.subscription.yearly}:{" "}
            {yearly.regular !== null && (
              <s className="me-1 text-ink-400">{formatMoney(yearly.regular, locale)}</s>
            )}
            {formatMoney(yearly.amount, locale)} {t.common.toman}
          </p>
        )}

        <ul className="mt-6 flex-1 space-y-2.5 text-sm">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-ink-700">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {line}
            </li>
          ))}
        </ul>

        <Link
          href={plan.isContractPriced ? "/contact" : "/register"}
          className={cn(
            "mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-bold transition-colors",
            recommended
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "border border-ink-300 text-ink-800 hover:border-ink-400",
          )}
        >
          {plan.isContractPriced ? t.landing.ctaContactSupport : ctaLabel}
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {listed.map(card)}
      </div>
      {contract.map(card)}
    </>
  );
}
