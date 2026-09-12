import type { Metadata, Viewport } from "next";
import { getI18n } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/ui/toast";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: "منولند | منوی دیجیتال حرفه‌ای رستوران و کافه",
    template: "%s | منولند",
  },
  description:
    "ساخت منوی دیجیتال زیبا با بارکد اختصاصی هر میز، سفارش‌گیری آنلاین، پنل آشپزخانه و گزارش دقیق فروش و سود برای رستوران‌ها و کافه‌ها.",
  keywords: [
    "منوی دیجیتال",
    "منو آنلاین رستوران",
    "بارکد منو",
    "QR منو",
    "سیستم سفارش‌گیری رستوران",
    "digital menu",
    "restaurant QR menu",
  ],
  openGraph: {
    type: "website",
    siteName: "منولند",
    locale: "fa_IR",
    alternateLocale: "en_US",
  },
  robots: { index: true, follow: true },
};

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
      </body>
    </html>
  );
}
