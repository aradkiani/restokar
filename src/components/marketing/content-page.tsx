import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { getI18n, getLocale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { getContent, getSiteInfo } from "@/lib/cms/content-server";
import { pick } from "@/lib/cms/schema";
import { plainText } from "@/lib/cms/markup";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { PreviewBanner } from "@/components/marketing/preview-banner";
import { RichText } from "@/components/rich-text";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/features";

export type ContentPageKey =
  "page-terms" | "page-privacy" | "page-refund" | "page-about" | "page-contact";

/** Title, description (the body's opening words) and canonical address. */
export async function contentPageMetadata(
  key: ContentPageKey,
  path: string,
): Promise<Metadata> {
  const [locale, page] = await Promise.all([getLocale(), getContent(key)]);
  const description = plainText(pick(page.body, locale)).slice(0, 160);
  return {
    title: pick(page.title, locale),
    description: description || undefined,
    alternates: { canonical: path },
  };
}

/**
 * A text page edited from /admin/content: the terms, privacy and refund
 * policies, about, and contact. The contact page also lists the phone, email
 * and address from the site settings above its text.
 */
export async function ContentPage({ docKey }: { docKey: ContentPageKey }) {
  const [{ t, locale }, user] = await Promise.all([getI18n(), getSessionUser()]);
  const [page, site] = await Promise.all([getContent(docKey), getSiteInfo(locale)]);
  const showContact = docKey === "page-contact";

  return (
    <>
      <PreviewBanner />
      <AnnouncementBar announcement={site.announcement} />
      <SiteHeader isAuthed={Boolean(user)} signupOpen={PUBLIC_REGISTRATION_ENABLED} />

      <main id="main" className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h1 className="text-3xl font-black text-ink-900 sm:text-4xl">
          {pick(page.title, locale)}
        </h1>

        {showContact && (site.phone || site.email || site.address) && (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {site.phone && (
              <li>
                <a
                  href={site.phone.href}
                  className="flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-surface px-4 text-ink-800 hover:border-ink-400"
                >
                  <Phone className="size-5 shrink-0 text-brand-600" />
                  <span dir="ltr" className="font-bold">
                    {site.phone.display}
                  </span>
                </a>
              </li>
            )}
            {site.email && (
              <li>
                <a
                  href={`mailto:${site.email}`}
                  className="flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-surface px-4 text-ink-800 hover:border-ink-400"
                >
                  <Mail className="size-5 shrink-0 text-brand-600" />
                  <span dir="ltr" className="font-bold">
                    {site.email}
                  </span>
                </a>
              </li>
            )}
            {site.address && (
              <li className="flex min-h-14 items-start gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-surface px-4 py-4 text-ink-800 sm:col-span-2">
                <MapPin className="mt-1 size-5 shrink-0 text-brand-600" />
                <span className="leading-8 whitespace-pre-line">{site.address}</span>
              </li>
            )}
          </ul>
        )}

        <RichText source={pick(page.body, locale)} className="mt-8" />
      </main>

      <SiteFooter site={site} t={t} locale={locale} />
    </>
  );
}
