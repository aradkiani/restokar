import type { Metadata, Viewport } from "next";
import { getI18n, getLocale } from "@/lib/i18n";
import { getContent } from "@/lib/cms/content-server";
import { siteInfo } from "@/lib/cms/site-info";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorReporter } from "@/components/error-reporter";
import { env } from "@/lib/env";
import "./globals.css";

/**
 * Site-wide title, description and link preview, from the admin's site
 * settings (/admin/site). Pages set their own title and canonical address;
 * the root deliberately sets no canonical, since every page would inherit it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, raw] = await Promise.all([getLocale(), getContent("site")]);
  const site = siteInfo(raw, locale);
  const image = site.ogImage ?? "/og.png";
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    title: { default: site.seoTitle, template: `%s | ${site.siteName}` },
    description: site.seoDescription,
    keywords: site.seoKeywords,
    openGraph: {
      type: "website",
      siteName: site.siteName,
      title: site.seoTitle,
      description: site.seoDescription,
      locale: locale === "en" ? "en_US" : "fa_IR",
      alternateLocale: locale === "en" ? "fa_IR" : "en_US",
      images: [{ url: image, width: 1200, height: 630, alt: site.siteName }],
    },
    twitter: { card: "summary_large_image", images: [image] },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#d98c1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getI18n();

  return (
    // No `data-theme` here on purpose. The light/dark preference belongs to the
    // signed-in panel and is applied on the dashboard and admin wrappers, so
    // the marketing site, pricing, login and every public menu stay light
    // regardless of the operator's preference or their operating system.
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/*
          Vazirmatn is self-hosted (@font-face in globals.css) — no CDN, no
          third-party runtime dependency. Preloading it removes the flash of
          fallback text on the first paint of a menu, which is the screen
          restaurant customers actually see.
        */}
        <link
          rel="preload"
          href="/fonts/Vazirmatn-Variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only-focusable focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
        >
          پرش به محتوای اصلی
        </a>
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
        <ErrorReporter />
      </body>
    </html>
  );
}
