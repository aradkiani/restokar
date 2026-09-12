import { cookies } from "next/headers";
import { ok, route } from "@/lib/api";
import { HttpError } from "@/lib/auth/guards";
import { isLocale } from "@/lib/i18n";
import { MENU_LOCALE_COOKIE, menuLocaleCookiePath } from "@/lib/i18n/menu-locale";
import { prisma } from "@/lib/prisma";
import { decodeSlug } from "@/lib/menu";

export const runtime = "nodejs";

/**
 * Remembers a *guest's* language choice for one venue.
 *
 * Deliberately separate from /api/locale, which sets the platform-wide UI
 * language for owners and visitors to the marketing site. Conflating the two is
 * what made an owner's dashboard language silently override the menu their
 * customers saw.
 *
 * The cookie is written with `path=/menu/<slug>`, so the browser only sends it
 * back for this venue. Choosing English at one restaurant therefore says
 * nothing about the next one, and nothing about the dashboard.
 */
export const POST = route(async (request: Request) => {
  const { slug, locale } = (await request.json().catch(() => ({}))) as {
    slug?: string;
    locale?: string;
  };

  if (!isLocale(locale)) throw new HttpError(400, "Unsupported locale", "BAD_LOCALE");
  if (typeof slug !== "string" || !slug) {
    throw new HttpError(400, "A restaurant slug is required", "BAD_SLUG");
  }

  // The slug decides a cookie path, so it is checked against a real bilingual
  // venue rather than trusted. Without this, any string could be used to plant
  // cookies on arbitrary paths of this origin.
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: decodeSlug(slug) },
    select: { slug: true, bilingualEnabled: true },
  });

  if (!restaurant?.bilingualEnabled) {
    throw new HttpError(404, "This menu is not bilingual", "NOT_BILINGUAL");
  }

  const store = await cookies();
  store.set(MENU_LOCALE_COOKIE, locale, {
    path: menuLocaleCookiePath(restaurant.slug),
    maxAge: 31_536_000,
    sameSite: "lax",
    httpOnly: false,
  });

  return ok({ locale });
});
