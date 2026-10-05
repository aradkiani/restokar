import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/validation";
import { createSession, pruneExpiredSessions } from "@/lib/auth/session";
import { decoyHash, isPasswordHash, verifyPassword } from "@/lib/auth/password";
import {
  clearLoginFailures,
  loginLockedFor,
  recordLoginFailure,
} from "@/lib/auth/login-guard";
import { clientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Signs in with a phone number and a password. No SMS: the code is needed once,
 * when the account is created or activated, never at sign-in.
 *
 * Every refusal reads the same — "the number or the password is wrong" — and
 * takes the same time, whether the number has no account, the account has no
 * password yet, or the password is wrong: a decoy hash is checked when there is
 * nothing real to check. Otherwise the answer, or how long it took, would tell
 * a stranger which numbers are registered.
 *
 * Wrong passwords are counted per number and per address (login-guard.ts):
 * five for one number, or twenty from one address, pause sign-in for fifteen
 * minutes. An account with no password yet cannot sign in here at all; the
 * page offers "activate your account" beside the form for exactly that case.
 */
export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const input = await parseBody(request, LoginSchema);

  const wait = await loginLockedFor(input.phone, ip);
  if (wait > 0) {
    return fail(429, "Too many wrong attempts", "LOGIN_LOCKED", {
      retryAfterSeconds: wait,
      minutes: Math.ceil(wait / 60),
    });
  }

  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  const stored = user && isPasswordHash(user.passwordHash) ? user.passwordHash : null;
  const matches = await verifyPassword(input.password, stored ?? (await decoyHash()));

  if (!user || !user.isActive || !stored || !matches) {
    await recordLoginFailure(input.phone, ip);
    return fail(401, "Wrong phone number or password", "LOGIN_FAILED");
  }

  await clearLoginFailures(input.phone);
  await createSession(
    { id: user.id, role: user.role, restaurantId: user.restaurantId },
    { userAgent: request.headers.get("user-agent"), ip },
  );

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await recordAudit({
    actor: { id: user.id, phone: user.phone, role: user.role },
    restaurantId: user.restaurantId,
    action: "LOGIN",
    summary: `ورود به حساب از ${ip}`,
    entityType: "User",
    entityId: user.id,
    ip,
  });

  void pruneExpiredSessions();

  // No kitchen-only destination: everyone who belongs to a restaurant lands on
  // the same dashboard, and the orders screen is one tab inside it.
  const redirectTo = user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";

  return ok({ redirectTo });
});
