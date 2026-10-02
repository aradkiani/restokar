/**
 * The resolved "site" document turned into what the public pages render:
 * one locale's text, ready-made links, and nothing shown that was left empty.
 *
 * Pure, so the footer, the contact page, the homepage and the dashboard's
 * subscription page all present the same details the same way.
 */
import { announcementLive, pick } from "./schema";

export interface SocialLink {
  key: "instagram" | "telegram" | "bale" | "eitaa";
  label: string;
  href: string;
}

export interface SiteInfo {
  siteName: string;
  /** Null when the admin has not entered a number: nothing is shown. */
  phone: { display: string; href: string } | null;
  email: string | null;
  address: string;
  socials: SocialLink[];
  footerText: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  ogImage: string | null;
  trialDays: number;
  showStats: boolean;
  /** Both parts are needed for the seal to verify; otherwise null. */
  enamad: { id: string; code: string } | null;
  announcement: { text: string; href: string | null } | null;
}

const SOCIAL_LABELS: Record<SocialLink["key"], { fa: string; en: string }> = {
  instagram: { fa: "اینستاگرام", en: "Instagram" },
  telegram: { fa: "تلگرام", en: "Telegram" },
  bale: { fa: "بله", en: "Bale" },
  eitaa: { fa: "ایتا", en: "Eitaa" },
};

/**
 * A `tel:` link from however the number was typed. Iranian numbers written
 * with the leading 0 are dialled internationally (+98) so the link works from
 * a phone roaming abroad as well.
 */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.startsWith("00")) return `tel:+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `tel:+98${digits.slice(1)}`;
  return `tel:${digits}`;
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function siteInfo(
  site: Record<string, unknown>,
  locale: string,
  now: Date = new Date(),
): SiteInfo {
  const phone = str(site.contactPhone);
  const email = str(site.contactEmail);
  const enamadId = str(site.enamadId);
  const enamadCode = str(site.enamadCode);
  const announcementLink = str(site.announcementLink);

  const socials = (Object.keys(SOCIAL_LABELS) as SocialLink["key"][])
    .map((key) => ({
      key,
      label: locale === "en" ? SOCIAL_LABELS[key].en : SOCIAL_LABELS[key].fa,
      href: str(site[key]),
    }))
    .filter((social) => social.href);

  return {
    siteName: pick(site.siteName, locale),
    phone: phone ? { display: phone, href: telHref(phone) } : null,
    email: email || null,
    address: pick(site.address, locale),
    socials,
    footerText: pick(site.footerText, locale),
    seoTitle: pick(site.seoTitle, locale),
    seoDescription: pick(site.seoDescription, locale),
    seoKeywords: str(site.seoKeywords)
      .split(/[,،]/)
      .map((word) => word.trim())
      .filter(Boolean),
    ogImage: str(site.ogImage) || null,
    trialDays: typeof site.trialDays === "number" ? site.trialDays : 0,
    showStats: site.showStats !== false,
    enamad: enamadId && enamadCode ? { id: enamadId, code: enamadCode } : null,
    announcement: announcementLive(site, now)
      ? { text: pick(site.announcementText, locale), href: announcementLink || null }
      : null,
  };
}

/** The verification page and seal image that enamad.ir issues for a site. */
export function enamadUrls(enamad: { id: string; code: string }) {
  const query = `id=${encodeURIComponent(enamad.id)}&Code=${encodeURIComponent(enamad.code)}`;
  return {
    href: `https://trustseal.enamad.ir/?${query}`,
    image: `https://trustseal.enamad.ir/logo.aspx?${query}`,
  };
}
