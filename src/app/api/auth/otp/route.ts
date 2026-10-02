import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { OtpRequestSchema } from "@/lib/validation";
import { clientIp } from "@/lib/rate-limit";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/features";
import { OTP_POLICY, otpRequestFailure, requestOtp } from "@/lib/auth/otp-server";

export const runtime = "nodejs";

/**
 * Sends a one-time code for signing in or signing up.
 *
 * The answer never says whether the number has an account. Sign-in texts a code
 * only to an active account's number and sign-up only to a number with no
 * account, but both store a challenge, apply the same cooldown and limits, and
 * answer the same way — a code that was never sent simply never verifies. The
 * page shows one sentence for both: "if this number can be used, a code is on
 * its way".
 *
 * Changing an account's number has its own route, `/api/account/phone`, because
 * it needs a session and sends to the *new* number.
 */
export const POST = route(async (request: Request) => {
  const input = await parseBody(request, OtpRequestSchema);

  if (input.purpose === "SIGNUP" && !PUBLIC_REGISTRATION_ENABLED) {
    return fail(403, "Registration is currently by invitation", "REGISTRATION_CLOSED");
  }

  if (input.purpose === "SIGNUP" && input.slug) {
    const taken = await prisma.restaurant.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (taken) return fail(409, "Menu address already taken", "SLUG_TAKEN");
  }

  const holder = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { isActive: true },
  });

  const result = await requestOtp({
    phone: input.phone,
    purpose: input.purpose,
    ip: clientIp(request),
    send: input.purpose === "LOGIN" ? Boolean(holder?.isActive) : !holder,
  });

  if (!result.ok) return otpRequestFailure(result);

  return ok({
    codeLength: OTP_POLICY.codeLength,
    cooldownSeconds: result.cooldownSeconds,
    expiresInSeconds: result.expiresInSeconds,
  });
});
