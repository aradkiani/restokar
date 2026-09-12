import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/validation";
import { fakeVerify, verifyPassword } from "@/lib/auth/password";
import { createSession, pruneExpiredSessions } from "@/lib/auth/session";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants";

export const runtime = "nodejs";

export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const input = await parseBody(request, LoginSchema);

  // Two windows: one per address to stop a spray, one per account to stop a
  // focused attack from many addresses.
  const ipKey = `login:ip:${ip}`;
  const acctKey = `login:acct:${input.email}`;
  const [byIp, byAccount] = await Promise.all([
    rateLimit(ipKey, RATE_LIMITS.loginPerIp),
    rateLimit(acctKey, RATE_LIMITS.loginPerAccount),
  ]);

  // Fallback text only — the client renders the localized string from `code`.
  if (!byIp.allowed || !byAccount.allowed) {
    return fail(429, "Too many attempts", "RATE_LIMITED");
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    // Burn comparable time so response latency does not reveal that the email
    // is unregistered.
    await fakeVerify();
    return fail(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) return fail(401, "Invalid credentials", "INVALID_CREDENTIALS");
  if (!user.isActive) return fail(403, "Account disabled", "ACCOUNT_DISABLED");

  // Credentials were correct: this attempt should not count against the limit.
  await Promise.all([resetRateLimit(ipKey), resetRateLimit(acctKey)]);

  await createSession(
    { id: user.id, role: user.role, restaurantId: user.restaurantId },
    { userAgent: request.headers.get("user-agent"), ip },
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await recordAudit({
    actor: { id: user.id, email: user.email, role: user.role },
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
