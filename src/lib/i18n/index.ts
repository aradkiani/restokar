import { cookies } from "next/headers";
import { fa, type Dictionary } from "./fa";
import { en } from "./en";

export const LOCALES = ["fa", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fa";
export const LOCALE_COOKIE = "restokar_locale";

const dictionaries: Record<Locale, Dictionary> = { fa, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "fa" ? "rtl" : "ltr";
}

/**
 * The visitor's explicit choice, or null if they have never chosen one.
 * Public menus need that distinction: an unset cookie should fall back to the
 * venue's own default language, not to the platform's.
 */
export async function getLocaleCookie(): Promise<Locale | null> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : null;
}

/**
 * Locale lives in a cookie rather than the URL so the public menu keeps the
 * exact address the product promises: /menu/<restaurant-name>.
 */
export async function getLocale(): Promise<Locale> {
  return (await getLocaleCookie()) ?? DEFAULT_LOCALE;
}

export async function getI18n(): Promise<{
  locale: Locale;
  t: Dictionary;
  dir: "rtl" | "ltr";
}> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale), dir: dir(locale) };
}

export type { Dictionary };
export { fa, en };
