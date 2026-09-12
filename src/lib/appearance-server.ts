import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_COOKIE, isThemePreference } from "./appearance";
import type { ThemePreference } from "./appearance";

/**
 * Reads the light/dark preference on the server so it can be rendered onto
 * `<html>` with the first byte.
 *
 * Split from appearance.ts because that module is imported by the client-side
 * toggle, and anything reachable from a client component may not pull in
 * `next/headers`.
 */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isThemePreference(value) ? value : DEFAULT_THEME;
}
