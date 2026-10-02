import Link from "next/link";
import { ChefHat, Mail, MapPin, Phone } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatYear } from "@/lib/format";
import { enamadUrls, type SiteInfo } from "@/lib/cms/site-info";

/**
 * The public site's footer: contact details, the legal pages, social links and
 * the eNamad trust seal — all from the admin's site settings, and each part
 * left out while it is empty rather than shown as a placeholder.
 */
export function SiteFooter({
  site,
  t,
  locale,
}: {
  site: SiteInfo;
  t: Dictionary;
  locale: Locale;
}) {
  const productLinks = [
    { href: "/#features", label: t.nav.features },
    { href: "/pricing", label: t.nav.pricing },
    { href: "/#faq", label: t.nav.faq },
    { href: "/login", label: t.nav.login },
  ];
  const infoLinks = [
    { href: "/about", label: t.nav.about },
    { href: "/contact", label: t.nav.contactUs },
    { href: "/terms", label: t.nav.terms },
    { href: "/privacy", label: t.nav.privacy },
    { href: "/refund-policy", label: t.nav.refund },
  ];
  const seal = site.enamad ? enamadUrls(site.enamad) : null;

  return (
    <footer className="border-t border-ink-200 bg-surface pt-10 pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-ink-950">
              <ChefHat className="size-4" />
            </span>
            <span className="text-sm font-black text-ink-900">{site.siteName}</span>
          </div>
          <ul className="mt-4 space-y-1 text-sm text-ink-600">
            {site.phone && (
              <li>
                <a
                  href={site.phone.href}
                  className="inline-flex min-h-9 items-center gap-2 hover:text-ink-900"
                >
                  <Phone className="size-4 shrink-0" />
                  <span dir="ltr">{site.phone.display}</span>
                </a>
              </li>
            )}
            {site.email && (
              <li>
                <a
                  href={`mailto:${site.email}`}
                  className="inline-flex min-h-9 items-center gap-2 hover:text-ink-900"
                >
                  <Mail className="size-4 shrink-0" />
                  <span dir="ltr">{site.email}</span>
                </a>
              </li>
            )}
            {site.address && (
              <li className="flex items-start gap-2 py-2 leading-7">
                <MapPin className="mt-1.5 size-4 shrink-0" />
                <span className="whitespace-pre-line">{site.address}</span>
              </li>
            )}
          </ul>
        </div>

        <nav aria-label={t.nav.features}>
          <ul className="space-y-1 text-sm font-semibold text-ink-600">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-9 items-center hover:text-ink-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t.nav.legal}>
          <ul className="space-y-1 text-sm font-semibold text-ink-600">
            {infoLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-9 items-center hover:text-ink-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          {site.socials.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink-500">{t.nav.social}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {site.socials.map((social) => (
                  <li key={social.key}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center rounded-full border border-ink-200 px-3.5 text-xs font-bold text-ink-700 hover:border-ink-400"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {seal && (
            // enamad.ir checks the referring site, so this link and image must
            // send the origin even though the site-wide policy is stricter.
            <a
              href={seal.href}
              target="_blank"
              rel="noopener"
              referrerPolicy="origin"
              className="inline-block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={seal.image}
                alt={t.nav.trustSeal}
                referrerPolicy="origin"
                width={88}
                height={96}
                className="h-24 w-auto"
              />
            </a>
          )}
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-6xl border-t border-ink-100 px-5 pt-6 text-xs text-ink-500">
        © {formatYear(new Date().getFullYear(), locale)} {site.siteName} —{" "}
        {site.footerText}
      </p>
    </footer>
  );
}
