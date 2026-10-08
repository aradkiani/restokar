import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ResetPasswordSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth/session";
import { otpVerifyFailure, verifyOtp } from "@/lib/auth/otp-server";
import { replacePassword } from "@/lib/auth/set-password";
import { clientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * A forgotten password: the texted code proves the number, and the holder
 * chooses a new password.
 *
 * Every session of the account ends — a reset is often the response to a lost
 * phone or a password someone else knows — and the person is signed in afresh
 * on this device only. The platform admin is never reset this way (the code
 * route does not text it); a number that is not an active account gets the
 * same answer as a wrong code.
 */
export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const input = await parseBody(request, ResetPasswordSchema);

  const outcome = await verifyOtp({
    phone: input.phone,
    purpose: "RESET_PASSWORD",
    code: input.code,
    ip,
  });
  if (outcome !== "VALID") return otpVerifyFailure(outcome);

  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.isActive || user.role === "SUPER_ADMIN") {
    return otpVerifyFailure("INVALID");
  }

  await replacePassword(user, input.password);
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerifiedAt: user.phoneVerifiedAt ?? now, lastLoginAt: now },
  });

  await createSession(
    { id: user.id, role: user.role, restaurantId: user.restaurantId },
    { userAgent: request.headers.get("user-agent"), ip },
  );

  await recordAudit({
    actor: { id: user.id, phone: user.phone, role: user.role },
    restaurantId: user.restaurantId,
    action: "PASSWORD_CHANGED",
    summary: "رمز عبور با کد پیامکی بازنشانی شد و همهٔ دستگاه‌ها خارج شدند",
    entityType: "User",
    entityId: user.id,
    ip,
  });

  return ok({ redirectTo: "/dashboard" });
});
