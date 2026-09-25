import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChefHat,
  ClipboardList,
  CreditCard,
  Mail,
  MapPin,
  Palette,
  Phone,
  QrCode,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { CONTACT } from "@/lib/constants";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatNumber } from "@/lib/format";
import { SiteHeader } from "@/components/marketing/site-header";
import { FaqList } from "@/components/marketing/faq-list";
import { TEMPLATES } from "@/templates/registry";
import {
  PUBLIC_REGISTRATION_ENABLED,
  SUBSCRIPTION_CHECKOUT_ENABLED,
} from "@/lib/features";

// Next.js requires route segment config to be a statically analyzable
// literal — it cannot be an imported constant.
export const revalidate = 300;

export default async function HomePage() {
  const [{ t, locale, dir }, user, plans, demoMenus, stats] = await Promise.all([
    getI18n(),
    getSessionUser(),
    prisma.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }),
    // Showcase venues only. This page previously listed the four oldest
    // published restaurants, which meant a paying customer's menu was
    // advertised on the marketing site the moment they signed up — their
    // pricing and product range exposed without consent. Only platform-owned
    // demos (isDemo) are eligible now.
    prisma.restaurant.findMany({
      where: { isDemo: true, isActive: true, isPublished: true },
      select: { slug: true, name: true, tagline: true, logoUrl: true, templateId: true },
      orderBy: { createdAt: "asc" },
      // One showcase per template. Derived from the registry rather than
      // hard-coded: the previous literal 6 outlived the catalogue it was
      // written for, and a stale cap here is invisible — the page still
      // renders, the newest templates just never appear on it.
      take: TEMPLATES.length,
    }),
    // Headline counts exclude demos so the numbers describe real adoption.
    prisma.$transaction([
      prisma.restaurant.count({ where: { isDemo: false } }),
      prisma.order.count(),
    ]),
  ]);

  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;
  const [restaurantCount, orderCount] = stats;

  // Present demos in the registry's template order so the showcase reads as
  // "here are our templates" rather than an arbitrary creation order.
  const templateOrder = new Map(TEMPLATES.map((template, index) => [template.id, index]));
  const showcase = [...demoMenus].sort(
    (a, b) =>
      (templateOrder.get(a.templateId) ?? 99) - (templateOrder.get(b.templateId) ?? 99),
  );

  const features = [
    { icon: Smartphone, title: t.features.menuTitle, text: t.features.menuText },
    { icon: QrCode, title: t.features.qrTitle, text: t.features.qrText },
    { icon: ClipboardList, title: t.features.orderTitle, text: t.features.orderText },
    { icon: ChefHat, title: t.features.kitchenTitle, text: t.features.kitchenText },
    { icon: BarChart3, title: t.features.analyticsTitle, text: t.features.analyticsText },
    { icon: Wallet, title: t.features.financeTitle, text: t.features.financeText },
    { icon: CreditCard, title: t.features.paymentTitle, text: t.features.paymentText },
    { icon: Palette, title: t.features.brandTitle, text: t.features.brandText },
  ];

  const steps = [
    { title: t.landing.step1Title, text: t.landing.step1Text, icon: UtensilsCrossed },
    { title: t.landing.step2Title, text: t.landing.step2Text, icon: Palette },
    { title: t.landing.step3Title, text: t.landing.step3Text, icon: QrCode },
  ];

  return (
    <>
      <SiteHeader isAuthed={Boolean(user)} signupOpen={PUBLIC_REGISTRATION_ENABLED} />

      <main id="main">
        {/* ---------------------------------------------------------- hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute start-1/2 -top-40 size-[42rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, var(--color-brand-400), transparent 65%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -end-32 top-40 size-[30rem] rounded-full opacity-20 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, var(--color-accent-500), transparent 70%)",
            }}
          />

          <div className="relative mx-auto max-w-4xl px-5 pt-16 pb-20 text-center sm:pt-24">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-3.5 py-1.5 text-xs font-bold text-brand-800 ring-1 ring-brand-200 backdrop-blur">
              <Sparkles className="size-3.5" />
              {t.landing.heroBadge}
            </span>

            <h1 className="mt-6 text-4xl leading-[1.15] font-black text-ink-900 sm:text-6xl">
              {t.landing.heroTitle}
              <br />
              <span className="bg-gradient-to-l from-brand-600 to-accent-600 bg-clip-text text-transparent">
                {t.landing.heroTitleAccent}
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-9 text-ink-600 sm:text-lg">
              {t.landing.heroSubtitle}
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="group inline-flex h-13 items-center gap-2 rounded-full bg-brand-600 px-7 text-base font-bold text-white shadow-[var(--shadow-glow)] transition-all hover:bg-brand-700 hover:shadow-[var(--shadow-lift)]"
              >
                {PUBLIC_REGISTRATION_ENABLED
                  ? t.landing.heroCtaPrimary
                  : t.landing.ctaContactSupport}
                <Arrow className="size-4.5 transition-transform group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#demo"
                className="inline-flex h-13 items-center gap-2 rounded-full border border-ink-300 bg-surface/80 px-7 text-base font-bold text-ink-800 backdrop-blur transition-colors hover:border-ink-400"
              >
                {t.landing.heroCtaSecondary}
              </a>
            </div>

            <p className="mt-4 text-xs font-semibold text-ink-500">
              {t.landing.heroNote}
            </p>

            <dl className="mx-auto mt-14 grid max-w-lg grid-cols-3 gap-4">
              {[
                {
                  value: formatNumber(Math.max(restaurantCount, 1), locale),
                  label: t.landing.statsRestaurants,
                },
                {
                  value: formatNumber(Math.max(orderCount, 1), locale),
                  label: t.landing.statsOrders,
                },
                /*
                  The third figure was a hard-coded «٪۹۹.۹» uptime claim, sitting
                  between two counts genuinely read from the database. The
                  service has never been measured for availability, and an
                  invented number beside two real ones undermines both — so this
                  reports the template catalogue instead, straight from the
                  registry that renders it.
                */
                {
                  value: formatNumber(TEMPLATES.length, locale),
                  label: t.landing.statsTemplates,
                },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block text-2xl font-black text-ink-900 sm:text-3xl">
                      {stat.value}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-ink-500">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------------ features */}
        <section id="features" className="scroll-mt-20 bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-black text-ink-900 sm:text-4xl">
                {t.landing.featuresTitle}
              </h2>
              <p className="mt-3 text-base leading-8 text-ink-600">
                {t.landing.featuresSubtitle}
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, text }) => (
                <article
                  key={title}
                  className="group rounded-[var(--radius-lg)] border border-ink-200 bg-ink-50/60 p-5 transition-all hover:-translate-y-1 hover:border-brand-200 hover:bg-surface hover:shadow-[var(--shadow-lift)]"
                >
                  <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-brand-100 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-base font-black text-ink-900">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-ink-600">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- how it works */}
        <section id="how" className="scroll-mt-20 py-14 sm:py-20">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-black text-ink-900 sm:text-4xl">
                {t.landing.howTitle}
              </h2>
              <p className="mt-3 text-base text-ink-600">{t.landing.howSubtitle}</p>
            </div>

            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="relative">
                  <div className="rounded-[var(--radius-lg)] border border-ink-200 bg-surface p-6 shadow-[var(--shadow-soft)]">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-black text-white tabular-nums">
                        {formatNumber(index + 1, locale)}
                      </span>
                      <step.icon className="size-5 text-brand-600" />
                    </div>
                    <h3 className="mt-4 text-base font-black text-ink-900">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-ink-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------------- demo */}
        <section id="demo" className="scroll-mt-20 bg-ink-950 py-14 text-white sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-black sm:text-4xl">{t.landing.demoTitle}</h2>
              <p className="mt-3 text-base text-ink-300">{t.landing.demoSubtitle}</p>
            </div>

            {showcase.length > 0 ? (
              // Three across: nine templates fill three even rows. At four
              // across the last row would sit half-empty.
              <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {showcase.map((restaurant) => {
                  const template = TEMPLATES.find(
                    (tpl) => tpl.id === restaurant.templateId,
                  );
                  return (
                    <Link
                      key={restaurant.slug}
                      href={`/menu/${restaurant.slug}`}
                      target="_blank"
                      className="group rounded-[var(--radius-lg)] border border-white/10 bg-white/5 p-5 transition-all hover:-translate-y-1 hover:border-brand-400/40 hover:bg-white/10"
                    >
                      <div className="mb-4 flex gap-1.5" aria-hidden>
                        {(template?.swatch ?? ["#d98c1f", "#faf7f2", "#26a08a"]).map(
                          (color) => (
                            <span
                              key={color}
                              className="size-5 rounded-md ring-1 ring-white/20"
                              style={{ background: color }}
                            />
                          ),
                        )}
                      </div>

                      {restaurant.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={restaurant.logoUrl}
                          alt=""
                          className="mb-3 size-12 rounded-full object-cover"
                        />
                      ) : (
                        <span className="mb-3 grid size-12 place-items-center rounded-full bg-brand-500 text-lg font-black text-ink-950">
                          {restaurant.name.trim().charAt(0)}
                        </span>
                      )}

                      <h3 className="text-sm font-black">{restaurant.name}</h3>
                      {restaurant.tagline && (
                        <p className="mt-1 line-clamp-2 text-xs leading-6 text-ink-400">
                          {restaurant.tagline}
                        </p>
                      )}
                      <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-400">
                        {t.common.preview}
                        <Arrow className="size-3.5 transition-transform group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" />
                      </p>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {TEMPLATES.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-[var(--radius-lg)] border border-white/10 bg-white/5 p-5"
                  >
                    <div className="mb-4 flex gap-1.5" aria-hidden>
                      {template.swatch.map((color) => (
                        <span
                          key={color}
                          className="size-5 rounded-md ring-1 ring-white/20"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                    <h3 className="text-sm font-black">
                      {locale === "en" ? template.nameEn : template.nameFa}
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-ink-400">
                      {locale === "en" ? template.descriptionEn : template.descriptionFa}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* -------------------------------------------------------- pricing */}
        <section id="pricing" className="scroll-mt-20 py-14 sm:py-20">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-black text-ink-900 sm:text-4xl">
                {t.nav.pricing}
              </h2>
              <p className="mt-3 text-base text-ink-600">{t.landing.ctaSubtitle}</p>

              {/* Prices stay visible — they are still what the venue pays. Only
                  the way to pay has moved offline, and saying so here is more
                  useful to a prospect than hiding the packaging entirely. */}
              {!SUBSCRIPTION_CHECKOUT_ENABLED && (
                <p className="mx-auto mt-4 max-w-md rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 px-4 py-3 text-sm leading-7 text-ink-700">
                  {t.landing.paymentsPausedBody}
                </p>
              )}
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {plans.map((plan, index) => {
                const highlighted = index === 1;
                return (
                  <div
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

                    <h3 className="text-lg font-black text-ink-900">
                      {locale === "en" ? plan.nameEn : plan.name}
                    </h3>
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

                    <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-700">
                      <li>
                        {plan.maxProducts < 0
                          ? t.subscription.unlimited
                          : formatNumber(plan.maxProducts, locale)}{" "}
                        {t.subscription.limitProducts}
                      </li>
                      <li>
                        {plan.maxCategories < 0
                          ? t.subscription.unlimited
                          : formatNumber(plan.maxCategories, locale)}{" "}
                        {t.subscription.limitCategories}
                      </li>
                      <li>
                        {plan.maxTables < 0
                          ? t.subscription.unlimited
                          : formatNumber(plan.maxTables, locale)}{" "}
                        {t.subscription.limitTables}
                      </li>
                      {plan.allowsAnalytics && <li>{t.dashboard.analytics}</li>}
                      {plan.allowsOnlinePay && <li>{t.features.paymentTitle}</li>}
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
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ faq */}
        <section id="faq" className="scroll-mt-20 bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="text-center text-3xl font-black text-ink-900 sm:text-4xl">
              {t.landing.faqTitle}
            </h2>
            <FaqList className="mt-10" />
          </div>
        </section>

        {/* -------------------------------------------------------- contact */}
        <section id="contact" className="scroll-mt-20 py-14 sm:py-20">
          <div className="mx-auto max-w-4xl px-5">
            <div className="rounded-[var(--radius-xl)] bg-ink-950 p-8 text-center text-white sm:p-12">
              <h2 className="text-3xl font-black sm:text-4xl">{t.landing.ctaTitle}</h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-ink-300">
                {t.landing.contactSubtitle}
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-500 px-7 text-base font-bold text-ink-950 transition-colors hover:bg-brand-400"
                >
                  {PUBLIC_REGISTRATION_ENABLED
                    ? t.landing.heroCtaPrimary
                    : t.landing.ctaContactSupport}
                  <Arrow className="size-4.5" />
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-ink-300">
                <a
                  href={CONTACT.phoneHref}
                  className="inline-flex min-h-11 items-center gap-2 hover:text-white"
                >
                  <Phone className="size-4" />
                  <span dir="ltr">{CONTACT.phone}</span>
                </a>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="inline-flex min-h-11 items-center gap-2 hover:text-white"
                >
                  <Mail className="size-4" />
                  <span dir="ltr">{CONTACT.email}</span>
                </a>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4" />
                  {locale === "fa" ? "تهران، ایران" : "Tehran, Iran"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200 bg-surface py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-ink-950">
              <ChefHat className="size-4" />
            </span>
            <span className="text-sm font-black text-ink-900">{t.common.appName}</span>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-ink-600">
            <a href="#features" className="hover:text-ink-900">
              {t.nav.features}
            </a>
            <a href="#pricing" className="hover:text-ink-900">
              {t.nav.pricing}
            </a>
            <a href="#faq" className="hover:text-ink-900">
              {t.nav.faq}
            </a>
            <Link href="/login" className="hover:text-ink-900">
              {t.nav.login}
            </Link>
          </nav>

          <p className="text-xs text-ink-500">
            ©{" "}
            {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
              useGrouping: false,
            }).format(new Date().getFullYear())}{" "}
            {t.common.appName} — {t.landing.footerRights}
          </p>
        </div>
      </footer>
    </>
  );
}
