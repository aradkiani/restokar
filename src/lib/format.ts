import type { Locale } from "./i18n";

/**
 * Prices are whole Toman. Persian output uses the Persian-Indic digits and the
 * Jalali calendar, which is what Iranian users expect to read.
 */
export function formatMoney(amount: number, locale: Locale = "fa"): string {
  const n = Math.round(amount || 0);
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatMoneyWithUnit(amount: number, locale: Locale = "fa"): string {
  return locale === "fa"
    ? `${formatMoney(amount, locale)} تومان`
    : `${formatMoney(amount, locale)} T`;
}

export function formatNumber(n: number, locale: Locale = "fa"): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(n || 0);
}

export function formatPercent(ratio: number, locale: Locale = "fa"): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

/** Compact form for dashboard tiles: ۱٬۲م / 1.2M */
export function formatCompact(n: number, locale: Locale = "fa"): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);
}

/**
 * Years are written without a thousands separator — "۱۴۰۵", never "۱٬۴۰۵".
 * `formatNumber` would group them, which reads as a quantity rather than a year.
 */
export function formatYear(year: number, locale: Locale = "fa"): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    useGrouping: false,
    maximumFractionDigits: 0,
  }).format(year);
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Swaps ASCII digits for Persian-Indic ones inside an already-composed string,
 * leaving punctuation alone. For values like "۰۹:۰۰" where the separator is
 * part of the label and `Intl.NumberFormat` has nothing to format.
 */
export function localizeDigits(value: string | number, locale: Locale = "fa"): string {
  const text = String(value);
  if (locale !== "fa") return text;
  return text.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]!);
}

const dateLocale = (locale: Locale) => (locale === "fa" ? "fa-IR" : "en-US");

export function formatDate(date: Date | string, locale: Locale = "fa"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(dateLocale(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export function formatDateShort(date: Date | string, locale: Locale = "fa"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(dateLocale(locale), {
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatTime(date: Date | string, locale: Locale = "fa"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(dateLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateTime(date: Date | string, locale: Locale = "fa"): string {
  return `${formatDate(date, locale)} — ${formatTime(date, locale)}`;
}

/** "۳ دقیقه پیش" / "3 min ago" — used on the kitchen board. */
export function formatRelative(date: Date | string, locale: Locale = "fa"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(dateLocale(locale), { numeric: "auto" });

  if (seconds < 60) return locale === "fa" ? "همین الان" : "just now";
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), "hour");
  return rtf.format(-Math.floor(seconds / 86400), "day");
}

/** Minutes elapsed — drives the kitchen board's urgency colouring. */
export function minutesSince(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
}

/**
 * Normalises Persian/Arabic-Indic digits typed by users into ASCII so numeric
 * inputs accept "۱۲۳" as well as "123".
 */
export function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

export function parseAmount(input: string): number {
  const normalized = toEnglishDigits(String(input)).replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
