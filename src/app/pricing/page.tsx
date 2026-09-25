import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatNumber } from "@/lib/format";
import { SiteHeader } from "@/components/marketing/site-header";
import { FaqList } from "@/components/marketing/faq-list";
import {
  PUBLIC_REGISTRATION_ENABLED,
  SUBSCRIPTION_CHECKOUT_ENABLED,
} from "@/lib/features";

export const metadata: Metadata = {
  title: "تعرفه‌ها",
  description: "پلن‌های اشتراک رستوکار برای رستوران‌ها و کافه‌ها — ۱۴ روز رایگان.",
};

// Must stay a literal: Next.js statically analyses segment config.
export const revalidate = 300;

export default async function PricingPage() {
  const [{ t, locale }, user, plans] = await Promise.all([
    getI18n(),
    getSessionUser(),
    prisma.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Quoted tiers render separately, beneath the listed ones.
  const listed = plans.filter((plan) => !plan.isContractPriced);
  const contract = plans.filter((plan) => plan.isContractPriced);

  return (
    <>
      <SiteHeader isAuthed={Boolean(user)} signupOpen={PUBLIC_REGISTRATION_ENABLED} />

      <main id="main" className="mx-auto max-w-5xl px-5 py-16">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-black text-ink-900">{t.nav.pricing}</h1>
          <p className="mt-3 text-base leading-8 text-ink-600">{t.landing.ctaSubtitle}</p>

          {!SUBSCRIPTION_CHECKOUT_ENABLED && (
            <p className="mx-auto mt-5 max-w-md rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 px-4 py-3 text-sm leading-7 text-ink-700">
              {t.landing.paymentsPausedBody}
            </p>
          )}
        </header>

        {/*
          Three listed tiers across, and the quoted chain tier centred beneath
          them. A "from" price does not belong in a row of exact ones — reading
          left to right it looks like the fourth step of the same ladder, when
          it is a different conversation. Sat under the middle card it reads as
          what it is: where you go when the ladder runs out.
        */}
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listed.map((plan, index) => {
            const highlighted = index === 1;

            /*
              Each tier lists what it adds, not the same eight lines three
              times over. Repeating an identical list under three different
              prices asks the reader to diff four numbers to find the
              difference; leading with "everything in the previous plan" says
              the ladder is cumulative and leaves room to name what is new.

              The two limits stay on every card because they are what the price
              is actually based on.
            */
            const limits = [
              `${plan.maxTables < 0 ? t.subscription.unlimited : formatNumber(plan.maxTables, locale)} ${t.subscription.limitTables}`,
              `${plan.maxDailyViews < 0 ? t.subscription.unlimited : formatNumber(plan.maxDailyViews, locale)} ${t.subscription.limitDailyViews}`,
            ];

            const perTier: string[][] = [
              // Small — the whole product, at its smallest size.
              [
                t.subscription.unlimitedMenu,
                t.features.qrTitle,
                t.features.kitchenTitle,
                t.dashboard.analytics,
              ],
              // Medium — the money features.
              [
                t.subscription.includesPrevious,
                t.features.paymentTitle,
                t.features.financeTitle,
                t.subscription.bilingualMenu,
              ],
              // Large — the ones a busy multi-room venue asks for.
              [
                t.subscription.includesPrevious,
                t.subscription.staffAccounts,
                t.subscription.bulkPricing,
                t.subscription.prioritySupport,
              ],
            ];

            const features = [...limits, ...(perTier[index] ?? perTier[0]!)];

            return (
              <section
                key={plan.id}
                className={`relative flex flex-col rounded-[var(--radius-lg)] border p-6 ${
                  highlighted
                    ? "border-brand-400 bg-surface shadow-[var(--shadow-lift)] ring-2 ring-brand-500/20 md:-my-3"
                    : "border-ink-200 bg-surface shadow-[var(--shadow-soft)]"
                }`}
              >
                {highlighted && (
                  <span className="absolute start-1/2 -top-3 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-black text-white">
                    {t.subscription.popular}
                  </span>
                )}

                <h2 className="text-lg font-black text-ink-900">
                  {locale === "en" ? plan.nameEn : plan.name}
                </h2>
                {plan.description && (
                  <p className="mt-1.5 text-xs leading-6 text-ink-500">
                    {plan.description}
                  </p>
                )}

                <p className="mt-5">
                  <span className="text-3xl font-black text-ink-900">
                    {formatMoney(plan.monthlyPrice, locale)}
                  </span>
                  <span className="ms-1.5 text-xs font-semibold text-ink-500">
                    {t.common.toman} / {t.subscription.perMonth}
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {t.subscription.yearly}: {formatMoney(plan.yearlyPrice, locale)}{" "}
                  {t.common.toman}
                </p>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-ink-700">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    highlighted
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-ink-300 text-ink-800 hover:border-ink-400"
                  }`}
                >
                  {PUBLIC_REGISTRATION_ENABLED
                    ? t.landing.heroCtaPrimary
                    : t.landing.ctaContactSupport}
                </Link>
              </section>
            );
          })}
        </div>

        {contract.map((plan) => (
          <section
            key={plan.id}
            className="mx-auto mt-5 flex max-w-md flex-col rounded-[var(--radius-lg)] border border-ink-300 bg-surface p-6 shadow-[var(--shadow-soft)] sm:max-w-lg"
          >
            <h2 className="text-lg font-black text-ink-900">
              {locale === "en" ? plan.nameEn : plan.name}
            </h2>
            {plan.description && (
              <p className="mt-1.5 text-xs leading-6 text-ink-500">{plan.description}</p>
            )}

            <p className="mt-5">
              <span className="me-1.5 text-xs font-semibold text-ink-500">
                {t.subscription.priceFrom}
              </span>
              <span className="text-3xl font-black text-ink-900">
                {formatMoney(plan.monthlyPrice, locale)}
              </span>
              <span className="ms-1.5 text-xs font-semibold text-ink-500">
                {t.common.toman} / {t.subscription.perMonth}
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-500">{t.subscription.contractNote}</p>

            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {[
                t.subscription.includesPrevious,
                t.subscription.unlimitedBranches,
                t.subscription.sharedMenu,
                t.subscription.branchAccounts,
                t.subscription.perBranchRevenue,
                t.subscription.customDomain,
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-ink-700">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-ink-300 text-sm font-bold text-ink-800 transition-colors hover:border-ink-400"
            >
              {t.landing.ctaContactSupport}
            </Link>
          </section>
        ))}

        <section className="mt-20">
          <h2 className="text-center text-2xl font-black text-ink-900">
            {t.landing.faqTitle}
          </h2>
          <FaqList className="mx-auto mt-8 max-w-3xl" />
        </section>
      </main>
    </>
  );
}
