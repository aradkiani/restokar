/**
 * Light/dark preference for the *signed-in panel* — the dashboard and the admin
 * console.
 *
 * Not the marketing site, the pricing page, login, or any public menu: those
 * are the storefront and stay light. Dark mode is a comfort setting for the
 * person working a long shift in the panel, not a restyling of what customers
 * see.
 *
 * Deliberately free of `next/headers`: the theme toggle is a client component
 * and needs these constants, so reading the cookie lives in
 * `appearance-server.ts` instead. Same split as i18n's index/client pair, and
 * for the same reason.
 *
 * Deliberately unrelated to a restaurant's own `theme`, which colours their
 * public menu. Those are different things owned by different people: a venue's
 * brand palette is chosen for their guests, while this is one operator's
 * preference for the screen they work on all evening. Keeping them apart is why
 * the dark rules in globals.css never reach inside `.menu-scope`.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemePreference = "system";
export const THEME_COOKIE = "restokar_theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * What to put on the panel wrapper's `data-theme`.
 *
 * All three values are emitted verbatim, "system" included — globals.css has a
 * rule for each. "system" carries no colours of its own and simply lets the
 * `prefers-color-scheme` media query decide, which keeps the OS setting working
 * without the server having to guess it and get it wrong on first paint.
 *
 * The attribute belongs on the dashboard and admin wrappers, never on `<html>`.
 * That placement is the whole mechanism confining dark mode to the panel.
 */
export function themeAttribute(preference: ThemePreference): ThemePreference {
  return preference;
}
