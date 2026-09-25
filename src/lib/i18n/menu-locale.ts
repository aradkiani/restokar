import { DEFAULT_LOCALE, isLocale, type Locale } from "./index";

/**
 * Language resolution for a *public menu*, which is a different question from
 * the language of the platform UI.
 *
 * Those two were previously the same cookie, and that was the bug: an owner who
 * set the dashboard to Persian silently forced every guest scanning their QR
 * code into Persian too, no matter what the venue's own "menu language" setting
 * said. Keeping them apart is the whole point of this module.
 *
 * The guest's choice is stored in a cookie scoped to `path=/menu/<slug>`, so
 * the browser only sends it back for the venue it was chosen on. Picking
 * English at one restaurant therefore does not silently re-language the next
 * one, and none of it touches the dashboard.
 */

export const MENU_LOCALE_COOKIE = "restokar_menu_locale";

/**
 * The cookie path that confines a guest's choice to one venue.
 *
 * Slugs may be Persian («سنتی-حشمت»), and such a slug reaches the browser as a
 * percent-encoded path segment. The cookie path has to match that encoded form
 * or the browser will never send the cookie back.
 */
export function menuLocaleCookiePath(slug: string): string {
  return `/menu/${encodeURIComponent(slug)}`;
}

export interface MenuLocaleInput {
  /** An explicit `?lang=` on the URL — a shared link or a QR code. */
  requested?: string | null;
  /** The guest's remembered choice for this venue, if any. */
  guestChoice?: string | null;
  /** The venue's own setting, from Restaurant.defaultLocale. */
  venueDefault?: string | null;
  /** Whether this venue offers a second language at all. */
  bilingualEnabled: boolean;
}

/**
 * Decides which language a menu renders in.
 *
 * A venue that has not enabled a second language always renders in its own
 * chosen language, and neither `?lang=` nor a stale cookie can override it.
 * That is deliberate: the owner's setting is the authority over their own menu,
 * and the previous behaviour — where a cookie quietly won — is exactly what
 * made changing the setting look like it did nothing.
 *
 * Once a venue *is* bilingual, the guest is in charge, because they are the one
 * who knows which language they read.
 */
export function resolveMenuLocale(input: MenuLocaleInput): Locale {
  const venueDefault = isLocale(input.venueDefault) ? input.venueDefault : DEFAULT_LOCALE;

  if (!input.bilingualEnabled) return venueDefault;

  if (isLocale(input.requested)) return input.requested;
  if (isLocale(input.guestChoice)) return input.guestChoice;
  return venueDefault;
}

/** The other language, for the guest-facing toggle. */
export function otherLocale(locale: Locale): Locale {
  return locale === "fa" ? "en" : "fa";
}
