"use client";

import * as React from "react";
import { fa } from "@/lib/i18n/fa";
import { en } from "@/lib/i18n/en";
import type { Dictionary, Locale } from "@/lib/i18n";

/**
 * Server components read the dictionary directly; this provider exists so
 * client components can reach the same strings without prop-drilling. The
 * dictionaries are static modules, so nothing is serialised over the wire —
 * only the two-character locale is.
 */
const DICTS: Record<Locale, Dictionary> = { fa, en };

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  dir: "rtl" | "ltr";
}

const I18nContext = React.createContext<I18nValue>({ locale: "fa", t: fa, dir: "rtl" });

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = React.useMemo<I18nValue>(
    () => ({ locale, t: DICTS[locale] ?? fa, dir: locale === "fa" ? "rtl" : "ltr" }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return React.useContext(I18nContext);
}
