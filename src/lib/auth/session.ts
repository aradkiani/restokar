import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { prisma } from "@/lib/prisma";
import { env, isProd } from "@/lib/env";
import { DAY_MS, SESSION_DAYS } from "@/lib/constants";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "restokar_session";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionClaims extends JWTPayload {
  sub: string; // user id
  sid: string; // Session row id — lets us revoke server-side
  role: Role;
  rid: string | null; // tenant id
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  restaurantId: string | null;
  sessionId: string;
  /**
   * Dashboard sections granted to a STAFF account; empty for every other role.
   *
   * Read from the user row here rather than carried in the token, so an owner
   * who removes a tab has removed it on that person's next request instead of
   * whenever their session happens to expire. Revocation that waits days is not
   * revocation.
   */
  staffTabs: string[];
}

async function signToken(claims: {
  sub: string;
  sid: string;
  role: Role;
  rid: string | null;
}) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("restokar")
    .setAudience("restokar-app")
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);
}

/** Signature-only verification. Safe on the Edge runtime (no DB access). */
export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, secret, {
      issuer: "restokar",
      audience: "restokar-app",
    });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(
  user: { id: string; role: Role; restaurantId: string | null },
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ip: meta.ip ?? null,
    },
  });

  const token = await signToken({
    sub: user.id,
    sid: session.id,
    role: user.role,
    rid: user.restaurantId,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Authoritative session read: verifies the JWT *and* confirms the session row
 * still exists and the user is still active, so revocation and deactivation
 * take effect immediately rather than at token expiry.
 *
 * Wrapped in React `cache()`, which memoises per request rather than across
 * them. A single dashboard render calls this from the layout, from the page and
 * again from whichever guard the route uses, and each call was a separate
 * `SELECT … JOIN "User"`. The result is identical every time within one request
 * — it is derived from one cookie — so the extra round trips bought nothing.
 * Revocation still takes effect on the next request, which is what the
 * DB-backed session was for; nothing here caches across requests.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyToken(token);
  if (!claims?.sid) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    restaurantId: session.user.restaurantId,
    sessionId: session.id,
    staffTabs: session.user.staffTabs,
  };
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const claims = await verifyToken(token);
    if (claims?.sid) {
      await prisma.session.deleteMany({ where: { id: claims.sid } });
    }
  }

  store.delete(SESSION_COOKIE);
}

/** Housekeeping for expired rows; called opportunistically on login. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
}
