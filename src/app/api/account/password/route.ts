import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/guards";
import { ChangePasswordSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";

export const runtime = "nodejs";

export const PATCH = route(async (request: Request) => {
  const sessionUser = await requireApiUser();

  // The current password is verified here, so without a limit this endpoint is
  // an unthrottled password oracle for anyone who gets hold of a session — a
  // borrowed kitchen tablet is the realistic case, not a remote attacker.
  const limitKey = `password:${sessionUser.id}`;
  const limit = await rateLimit(limitKey, RATE_LIMITS.passwordChange);
  if (!limit.allowed) {
    return fail(429, "تعداد تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید.", "RATE_LIMITED");
  }

  const input = await parseBody(request, ChangePasswordSchema);

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { passwordHash: true },
  });
  if (!user) return fail(404, "کاربر پیدا نشد", "NOT_FOUND");

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) return fail(400, "رمز فعلی اشتباه است", "WRONG_PASSWORD");

  // Correct current password: this attempt should not count against the limit,
  // matching how the login limiter treats a successful sign-in.
  await resetRateLimit(limitKey);

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: sessionUser.id }, data: { passwordHash } }),
    // Signing out other devices is the point of changing a password; the
    // current session is preserved so the user is not bounced to /login.
    prisma.session.deleteMany({
      where: { userId: sessionUser.id, id: { not: sessionUser.sessionId } },
    }),
  ]);

  return ok({ changed: true });
});
