import { cookies } from "next/headers";
import { ok, route } from "@/lib/api";
import { HttpError } from "@/lib/auth/guards";
import { THEME_COOKIE, isThemePreference } from "@/lib/appearance";

export const runtime = "nodejs";

/**
 * Persists the light/dark preference for the product chrome.
 *
 * A cookie rather than a user row on purpose: it is a per-device preference,
 * not an account setting. The same owner reasonably wants dark on the tablet by
 * the pass and light on the office laptop, and it has to work before login on
 * the marketing site where there is no user to attach it to.
 */
export const POST = route(async (request: Request) => {
  const { theme } = (await request.json().catch(() => ({}))) as { theme?: string };

  if (!isThemePreference(theme)) {
    throw new HttpError(400, "Unsupported theme", "BAD_THEME");
  }

  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax",
    httpOnly: false,
  });

  return ok({ theme });
});
