import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/guards";
import { PhoneChangeRequestSchema, PhoneChangeSchema } from "@/lib/validation";
import {
  OTP_POLICY,
  otpRequestFailure,
  otpVerifyFailure,
  requestOtp,
  verifyOtp,
} from "@/lib/auth/otp-server";
import { clientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { maskPhone } from "@/lib/sms/recipients";

export const runtime = "nodejs";

/**
 * Moving an account to a new sign-in number.
 *
 * The number is the account, so it only changes once the *new* number has
 * proved itself: POST texts a code to it, PATCH saves it with that code. The
 * code is bound to this account (`userId`), so a code requested by one person
 * cannot move another's number.
 *
 * A number that already belongs to someone else gets no SMS, and the answer is
 * the same as for a free one — the save then fails as a wrong code. Saying "that
 * number is taken" would let any signed-in account test which numbers exist.
 */
export const POST = route(async (request: Request) => {
  const user = await requireApiUser();
  const input = await parseBody(request, PhoneChangeRequestSchema);

  const holder = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });

  const result = await requestOtp({
    phone: input.phone,
    purpose: "CHANGE_PHONE",
    ip: clientIp(request),
    userId: user.id,
    send: !holder,
  });
  if (!result.ok) return otpRequestFailure(result);

  return ok({
    codeLength: OTP_POLICY.codeLength,
    cooldownSeconds: result.cooldownSeconds,
    expiresInSeconds: result.expiresInSeconds,
  });
});

export const PATCH = route(async (request: Request) => {
  const user = await requireApiUser();
  const ip = clientIp(request);
  const input = await parseBody(request, PhoneChangeSchema);

  const outcome = await verifyOtp({
    phone: input.phone,
    purpose: "CHANGE_PHONE",
    code: input.code,
    ip,
    userId: user.id,
  });
  if (outcome !== "VALID") return otpVerifyFailure(outcome);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: input.phone, phoneVerifiedAt: new Date() },
    });
  } catch (error) {
    // Claimed by another account in the two minutes since the code was sent.
    if ((error as { code?: string })?.code === "P2002")
      return otpVerifyFailure("INVALID");
    throw error;
  }

  await recordAudit({
    // The new number: it is the one this account now signs in with.
    actor: { id: user.id, phone: input.phone, role: user.role },
    restaurantId: user.restaurantId,
    action: "PHONE_CHANGED",
    summary: `شماره ورود از ${maskPhone(user.phone ?? "")} به ${maskPhone(input.phone)} تغییر کرد`,
    entityType: "User",
    entityId: user.id,
    metadata: { from: user.phone, to: input.phone },
    ip,
  });

  return ok({ phone: input.phone });
});
