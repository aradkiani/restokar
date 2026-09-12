import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge-side gate for the private areas. (Next 16 renamed this convention from
 * `middleware` to `proxy`; the behaviour is unchanged.)
 *
 * This only verifies the token's *signature* — Prisma cannot run on the Edge
 * runtime, so session revocation and role checks are re-done authoritatively in
 * the pages and route handlers via getSessionUser(). The purpose here is to
 * turn "not signed in" into a clean redirect instead of a flash of dashboard
 * chrome followed by one.
 */
const SESSION_COOKIE = "menuland_session";

/**
 * The signing key, or nothing.
 *
 * This deliberately has **no fallback**. It used to default to the example
 * secret from `.env.example` — a value published in this repository — whenever
 * `AUTH_SECRET` was absent. `src/lib/env.ts` refuses to boot without a real
 * secret, but it does not run here: the Edge runtime cannot load it, so this
 * file reads `process.env` directly and the boot guard never applied to it.
 *
 * On a deployment where the variable failed to reach the Edge runtime, every
 * token would have been verified against a key anyone can read, and a forged
 * cookie would have passed this gate. It would still have been stopped by
 * `getSessionUser()`, which checks the session row in the database — so this was
 * a weakened outer layer rather than an open door — but "the next layer catches
 * it" is not a reason to verify signatures against a public constant.
 *
 * Missing key now means no token verifies, so private routes redirect to login.
 * Failing closed is the correct direction for a gate.
 */
const secretValue = process.env.AUTH_SECRET;
const secret = secretValue ? new TextEncoder().encode(secretValue) : null;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let claims: { role?: string } | null = null;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, secret, {
        issuer: "menuland",
        audience: "menuland-app",
      });
      claims = payload as { role?: string };
    } catch {
      claims = null;
    }
  }

  const isPrivate = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isPrivate && !claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Platform staff have no tenant dashboard to land on.
  if (pathname.startsWith("/admin") && claims && claims.role !== "SUPER_ADMIN") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isAuthPage && claims) {
    const url = request.nextUrl.clone();
    url.pathname = claims.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
