import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/validation";
import { createSession, pruneExpiredSessions } from "@/lib/auth/session";
import { otpVerifyFailure, pruneOtpChallenges, verifyOtp } from "@/lib/auth/otp-server";
import { clientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Signs in with a phone number and the code texted to it.
 *
 * There is no password. The code is the proof, and `verifyOtp` holds every
 * limit that matters here: five wrong guesses lock the code, codes expire after
 * two minutes, and guesses from one address are capped across all numbers.
 *
 * The first successful sign-in is also the moment an account created by
 * someone else — a staff member, a branch manager, an owner onboarded by
 * platform staff — proves the number is theirs, so `phoneVerifiedAt` is set
 * then if it was not already.
 */
export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const input = await parseBody(request, LoginSchema);

  const outcome = await verifyOtp({
    phone: input.phone,
    purpose: "LOGIN",
    code: input.code,
    ip,
  });
  if (outcome !== "VALID") return otpVerifyFailure(outcome);

  // A sign-in code is only ever texted to an active account's number, so a
  // valid one should always find one. Answered as a wrong code if not — an
  // account disabled in the last two minutes — rather than saying why.
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.isActive) return otpVerifyFailure("INVALID");

  await createSession(
    { id: user.id, role: user.role, restaurantId: user.restaurantId },
    { userAgent: request.headers.get("user-agent"), ip },
  );

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now, phoneVerifiedAt: user.phoneVerifiedAt ?? now },
  });

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
  void pruneOtpChallenges(now);

  // No kitchen-only destination: everyone who belongs to a restaurant lands on
  // the same dashboard, and the orders screen is one tab inside it.
  const redirectTo = user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";

  return ok({ redirectTo });
});
