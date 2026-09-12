"use client";

import * as React from "react";
import { Phone } from "lucide-react";
import { useMenu } from "./runtime";
import { SocialIcon } from "@/components/social-icon";
import { getSocialPlatform, socialHref } from "@/lib/socials";

/**
 * The foot of every public menu: how to reach the venue, and nothing else.
 *
 * Two numbers stacked, then a row of up to three social buttons, both centred.
 * The layout is deliberately sparse — a guest reaches this only after scrolling
 * the whole menu, and what they want at that point is a way to call or follow,
 * not a second copy of the venue's name and blurb.
 *
 * The vertical padding is generous for a second reason: the category rail's
 * scroll-spy treats the end of the document as "you are in the last category",
 * and a footer with no height would let the last section end flush with the
 * page, leaving that state hard to reach. The space here is doing real work.
 *
 * Shared by all ten templates.
 */
export function MenuFooter() {
  const { t, locale, data } = useMenu();
  const { restaurant } = data;

  const phones = [restaurant.phone, restaurant.phoneSecondary]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  // A link whose URL does not survive validation is dropped rather than
  // rendered dead — an icon that goes nowhere is worse than one less icon.
  const socials = restaurant.socialLinks
    .map((link) => ({ link, href: socialHref(link) }))
    .filter((entry): entry is { link: typeof entry.link; href: string } =>
      Boolean(entry.href),
    );

  if (phones.length === 0 && socials.length === 0) return null;

  return (
    <footer
      className="relative z-10 mt-16 border-t px-5 pt-12 pb-16"
      style={{ borderColor: "var(--m-border)" }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-9">
        {phones.length > 0 && (
          /*
           * One line per number, each its own `tel:` link. The gap is wide for
           * thumbs: two 44px targets stacked with only a hairline between them
           * is how you call the landline when you meant the mobile.
           */
          <ul className="flex w-full flex-col items-center gap-3">
            {phones.map((phone) => (
              <li key={phone} className="w-full">
                <a
                  href={`tel:${phone}`}
                  className="tap-safe flex min-h-12 w-full items-center justify-center gap-2.5 rounded-[var(--m-radius-sm)] text-base font-bold transition-colors"
                  style={{
                    border: "1px solid var(--m-border)",
                    color: "var(--m-text)",
                  }}
                >
                  <Phone
                    className="size-4 shrink-0"
                    style={{ color: "var(--m-primary)" }}
                    aria-hidden
                  />
                  {/* A phone number is Latin digits and must not mirror in an
                      RTL page, so the value carries its own direction. */}
                  <span dir="ltr" className="tabular-nums">
                    {phone}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {socials.length > 0 && (
          <ul className="flex items-center justify-center gap-4">
            {socials.map(({ link, href }) => {
              const platform = getSocialPlatform(link.platform);
              const label = locale === "en" ? platform?.labelEn : platform?.labelFa;

              return (
                <li key={link.platform}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label ?? link.platform}
                    className="grid size-12 place-items-center rounded-[var(--m-radius-sm)] transition-colors"
                    style={{
                      border: "1px solid var(--m-border)",
                      color: "var(--m-text)",
                    }}
                  >
                    <SocialIcon platform={link.platform} className="size-5" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] opacity-40">
          {t.publicMenu.poweredBy} {t.common.appName}
        </p>
      </div>
    </footer>
  );
}
