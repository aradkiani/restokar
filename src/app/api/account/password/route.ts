import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PasswordChangeSchema } from "@/lib/validation";
import { requireApiUser } from "@/lib/auth/guards";
import {
  PASSWORD_MESSAGES,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Changing one's own password, for every role — owner, branch manager, staff
 * and platform admin alike.
 *
 * The current password is required even though there is a session: a phone
 * left unlocked on a counter must not let a passer-by lock the owner out. The
 * attempts are rate-limited for the same reason a sign-in is. Every other
 * signed-in device is signed out afterwards, so a changed password actually
 * ends whatever prompted the change.
 */
export const POST = route(async (request: Request) => {
  const user = await requireApiUser();
  const ip = clientIp(request);
  const limit = await rateLimit(`password-change:${user.id}`, {
    limit: 10,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) return fail(429, "Too many attempts", "RATE_LIMITED");

  const input = await parseBody(request, PasswordChangeSchema);
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, phone: true },
  });

  if (!(await verifyPassword(input.currentPassword, row.passwordHash))) {
    return fail(422, "Current password is wrong", "VALIDATION_ERROR", {
      currentPassword: "رمز عبور فعلی درست نیست",
    });
  }
  const problem = passwordProblem(input.newPassword, { phone: row.phone });
  if (problem) {
    return fail(422, "Invalid password", "VALIDATION_ERROR", {
      newPassword: PASSWORD_MESSAGES[problem],
    });
  }
  if (await verifyPassword(input.newPassword, row.passwordHash)) {
    return fail(422, "Same password", "VALIDATION_ERROR", {
      newPassword: "رمز تازه باید با رمز فعلی فرق داشته باشد",
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    }),
    prisma.session.deleteMany({
      where: { userId: user.id, NOT: { id: user.sessionId } },
    }),
  ]);

  await recordAudit({
    actor: user,
    restaurantId: user.restaurantId,
    action: "PASSWORD_CHANGED",
    summary: "رمز عبور تغییر کرد",
    entityType: "User",
    entityId: user.id,
    ip,
  });

  return ok({ changed: true });
});
