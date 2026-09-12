import type { Locale } from "./index";

/**
 * Picks the right language for a piece of *tenant-authored* content.
 *
 * Platform strings live in the fa/en dictionaries and are always complete —
 * a missing key there is a compile error. Restaurant content is different: an
 * owner may translate half their menu and stop, so every English field is
 * nullable and every read has to decide what to do about that.
 *
 * The rule is one line and it is applied everywhere: fall back to Persian.
 * A guest reading an English menu that still shows «کشک بادمجان» for one dish
 * has lost nothing; a guest shown an empty card has lost the dish. Blank text
 * is the only genuinely broken outcome, so it is the one this prevents.
 */
export function localizedText(
  locale: Locale,
  persian: string,
  english: string | null | undefined,
): string;
export function localizedText(
  locale: Locale,
  persian: string | null | undefined,
  english: string | null | undefined,
): string | null;
export function localizedText(
  locale: Locale,
  persian: string | null | undefined,
  english: string | null | undefined,
): string | null {
  if (locale === "en") {
    // Whitespace-only counts as absent: an owner who tabbed through a field
    // and left a space has not written a translation.
    const trimmed = english?.trim();
    if (trimmed) return trimmed;
  }
  return persian ?? null;
}
