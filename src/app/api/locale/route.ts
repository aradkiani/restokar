import { cookies } from "next/headers";
import { ok, route } from "@/lib/api";
import { HttpError } from "@/lib/auth/guards";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";

export const runtime = "nodejs";

/** Persists the visitor's language choice for a year. */
export const POST = route(async (request: Request) => {
  const { locale } = (await request.json().catch(() => ({}))) as { locale?: string };

  if (!isLocale(locale)) throw new HttpError(400, "Unsupported locale", "BAD_LOCALE");

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax",
    httpOnly: false,
  });

  return ok({ locale });
});
