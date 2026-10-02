import type { Metadata } from "next";
import { getI18n, getLocale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/marketing/site-header";
import { FaqList } from "@/components/marketing/faq-list";
import { PlanGrid } from "@/components/marketing/plan-grid";
import { SiteFooter } from "@/components/marketing/site-footer";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { PreviewBanner } from "@/components/marketing/preview-banner";
import { getContent, getFaq, getSiteInfo } from "@/lib/cms/content-server";
import { pick } from "@/lib/cms/schema";
import {
  PUBLIC_REGISTRATION_ENABLED,
  SUBSCRIPTION_CHECKOUT_ENABLED,
} from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, page] = await Promise.all([getLocale(), getContent("pricing")]);
  return {
    title: pick(page.title, locale),
    description: pick(page.seoDescription, locale),
    alternates: { canonical: "/pricing" },
  };
}

// Must stay a literal: Next.js statically analyses segment config.
export const revalidate = 300;

export default async function PricingPage() {
  const [{ t, locale }, user, plans] = await Promise.all([
    getI18n(),
    getSessionUser(),
    prisma.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const [page, home, site, faq] = await Promise.all([
    getContent("pricing"),
    getContent("home"),
    getSiteInfo(locale),
    getFaq(locale),
  ]);
  const ctaLabel = pick(
    PUBLIC_REGISTRATION_ENABLED ? home.heroCtaPrimary : home.ctaContactSupport,
    locale,
  );

  return (
    <>
      <PreviewBanner />
      <AnnouncementBar announcement={site.announcement} />
      <SiteHeader isAuthed={Boolean(user)} signupOpen={PUBLIC_REGISTRATION_ENABLED} />

      <main id="main" className="mx-auto max-w-5xl px-5 py-16">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-black text-ink-900">{pick(page.title, locale)}</h1>
          <p className="mt-3 text-base leading-8 text-ink-600">
            {pick(page.subtitle, locale)}
          </p>

          {!SUBSCRIPTION_CHECKOUT_ENABLED && (
            <p className="mx-auto mt-5 max-w-md rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 px-4 py-3 text-sm leading-7 text-ink-700">
              {t.landing.paymentsPausedBody}
            </p>
          )}
        </header>

        <PlanGrid plans={plans} t={t} locale={locale} ctaLabel={ctaLabel} />

        {faq.length > 0 && (
          <section className="mt-20">
            <h2 className="text-center text-2xl font-black text-ink-900">
              {pick(home.faqTitle, locale)}
            </h2>
            <FaqList items={faq} className="mx-auto mt-8 max-w-3xl" />
          </section>
        )}
      </main>

      <SiteFooter site={site} t={t} locale={locale} />
    </>
  );
}
