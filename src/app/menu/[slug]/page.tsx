import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getPublicMenu, pausedVenue } from "@/lib/menu";
import { MenuPaused } from "./paused";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/client";
import { localizedText } from "@/lib/i18n/content";
import { MENU_LOCALE_COOKIE, resolveMenuLocale } from "@/lib/i18n/menu-locale";
import { themeToCssVars } from "@/lib/theme";
import { MenuView } from "@/templates/menu-view";
import { MenuBackdrop } from "@/components/menu-background";
import { env } from "@/lib/env";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string; lang?: string }>;
}

// Menus change whenever an owner edits a product, so they are rendered on
// demand and cached briefly at the edge rather than statically built.
// Must stay a literal: Next.js statically analyses segment config.
// Short window so a price change reaches guests quickly.
export const revalidate = 60;

/**
 * Menus do not zoom.
 *
 * A guest holds the phone one-handed at a table and scrolls a long list with
 * the thumb, which is exactly the gesture a browser mistakes for a pinch, and
 * double-tapping a dish to open it is exactly the gesture it mistakes for
 * double-tap-to-zoom. Both leave the page scaled and offset with no visible way
 * back — the layout is already sized for the device, so there is nothing to
 * zoom *to*, only a menu that has come off its rails.
 *
 * Scoped to the menu routes on purpose. The root layout leaves the dashboard,
 * admin and marketing pages zoomable, because those carry dense tables an owner
 * may genuinely need to magnify.
 *
 * The accessibility cost is real and deliberate: this is WCAG 1.4.4, and a
 * low-vision guest loses pinch-to-magnify. What survives is OS-level zoom and
 * the browser's own text-size setting, neither of which this disables, and the
 * templates already set body text at 14-16px with a `tap-safe` 44px minimum.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const menu = await getPublicMenu(slug);

  if (!menu) return { title: "منو پیدا نشد", robots: { index: false } };

  const { restaurant } = menu.data;

  // Crawlers and social cards get the venue's own language — its default, since
  // there is no guest to have a preference at this point.
  const locale = resolveMenuLocale({
    venueDefault: menu.defaultLocale,
    bilingualEnabled: restaurant.bilingualEnabled,
  });
  const t = getDictionary(locale);

  const title = localizedText(locale, restaurant.name, restaurant.nameEn);
  const description =
    localizedText(locale, restaurant.description, restaurant.descriptionEn) ??
    localizedText(locale, restaurant.tagline, restaurant.taglineEn) ??
    `${title} — ${t.publicMenu.metaFallback}`;
  const url = `${env.NEXT_PUBLIC_APP_URL}/menu/${restaurant.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: restaurant.coverUrl
        ? [{ url: restaurant.coverUrl }]
        : restaurant.logoUrl
          ? [{ url: restaurant.logoUrl }]
          : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicMenuPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { table, lang } = await searchParams;

  const menu = await getPublicMenu(slug);
  if (!menu) {
    // A lapsed subscription takes the menu offline, but the QR code on the
    // table still leads here: say so politely rather than "not found".
    const paused = await pausedVenue(slug);
    if (paused) return <MenuPaused name={paused.name} />;
    notFound();
  }

  // The guest's remembered choice is scoped to this venue by cookie path, and
  // is deliberately NOT the platform-wide locale cookie: an owner's dashboard
  // language must not decide what their customers read.
  const store = await cookies();
  const locale: Locale = resolveMenuLocale({
    requested: lang,
    guestChoice: store.get(MENU_LOCALE_COOKIE)?.value,
    venueDefault: menu.defaultLocale,
    bilingualEnabled: menu.data.restaurant.bilingualEnabled,
  });

  const cssVars = themeToCssVars(menu.theme);
  const { restaurant } = menu.data;

  // Structured data so a venue's menu can surface directly in search results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurant.name,
    description: restaurant.description ?? restaurant.tagline ?? undefined,
    image: restaurant.coverUrl ?? restaurant.logoUrl ?? undefined,
    telephone: restaurant.phone ?? undefined,
    address: restaurant.address
      ? { "@type": "PostalAddress", streetAddress: restaurant.address }
      : undefined,
    url: `${env.NEXT_PUBLIC_APP_URL}/menu/${restaurant.slug}`,
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: menu.data.categories.map((category) => ({
        "@type": "MenuSection",
        name: category.name,
        hasMenuItem: category.products.map((product) => ({
          "@type": "MenuItem",
          name: product.name,
          description: product.shortDescription ?? undefined,
          offers: restaurant.showPrices
            ? { "@type": "Offer", price: product.price, priceCurrency: "IRR" }
            : undefined,
        })),
      })),
    },
  };

  return (
    <div
      className="menu-scope"
      style={cssVars as React.CSSProperties}
      dir={locale === "fa" ? "rtl" : "ltr"}
      lang={locale}
    >
      <MenuBackdrop image={menu.theme.backgroundImage} />

      <script
        type="application/ld+json"
        // The payload contains owner-supplied text (restaurant and product
        // names). Inside a <script> block the HTML parser still honours a
        // literal "</script>", so escaping `<` is what stops a product named
        // `</script><script>…` from breaking out and executing.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <MenuView
        data={menu.data}
        theme={menu.theme}
        templateId={menu.templateId}
        locale={locale}
        presetTable={table ?? null}
      />
    </div>
  );
}
