import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ActivateSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth/session";
import { hashPassword, isPasswordHash } from "@/lib/auth/password";
import { otpVerifyFailure, verifyOtp } from "@/lib/auth/otp-server";
import { clientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Activates an account that has no password yet: one code proves the number,
 * once, and the password chosen here is what every later sign-in uses.
 *
 * For accounts someone else created — a staff member, a branch manager, an
 * owner onboarded by platform staff — and for accounts from before passwords.
 * An account that already has a password is refused exactly as a wrong code
 * is: activation must not double as a way to replace someone's password.
 */
export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const input = await parseBody(request, ActivateSchema);

  const outcome = await verifyOtp({
    phone: input.phone,
    purpose: "LOGIN",
    code: input.code,
    ip,
  });
  if (outcome !== "VALID") return otpVerifyFailure(outcome);

  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.isActive || isPasswordHash(user.passwordHash)) {
    return otpVerifyFailure("INVALID");
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(input.password),
      phoneVerifiedAt: user.phoneVerifiedAt ?? now,
      lastLoginAt: now,
    },
  });

  await createSession(
    { id: user.id, role: user.role, restaurantId: user.restaurantId },
    { userAgent: request.headers.get("user-agent"), ip },
  );

  await recordAudit({
    actor: { id: user.id, phone: user.phone, role: user.role },
    restaurantId: user.restaurantId,
    action: "PASSWORD_CHANGED",
    summary: "حساب فعال شد و رمز عبور تعیین شد",
    entityType: "User",
    entityId: user.id,
    ip,
  });

  return ok({ redirectTo: user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard" });
});
