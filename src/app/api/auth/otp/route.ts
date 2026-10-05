import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { OtpRequestSchema } from "@/lib/validation";
import { clientIp } from "@/lib/rate-limit";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/features";
import { OTP_POLICY, otpRequestFailure, requestOtp } from "@/lib/auth/otp-server";
import { isPasswordHash } from "@/lib/auth/password";

export const runtime = "nodejs";

/**
 * Sends a one-time code — only ever to prove a phone number, once:
 *
 *  - SIGNUP, for a number with no account;
 *  - ACTIVATE, for an active account that has no password yet (created by an
 *    owner or by platform staff, or from before passwords existed).
 *
 * Sign-in never asks for a code; it is phone and password.
 *
 * The answer never says whether the number has an account. A code is texted
 * only when the case above applies, but every request stores a challenge,
 * applies the same cooldown and limits, and answers the same way — a code that
 * was never sent simply never verifies.
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
    select: { isActive: true, passwordHash: true },
  });

  // Activation is stored under the LOGIN purpose the challenge table already
  // has; it is the same proof — this number belongs to this account.
  const result = await requestOtp({
    phone: input.phone,
    purpose: input.purpose === "SIGNUP" ? "SIGNUP" : "LOGIN",
    ip: clientIp(request),
    send:
      input.purpose === "SIGNUP"
        ? !holder
        : Boolean(holder?.isActive) && !isPasswordHash(holder?.passwordHash),
  });

  if (!result.ok) return otpRequestFailure(result);

  return ok({
    codeLength: OTP_POLICY.codeLength,
    cooldownSeconds: result.cooldownSeconds,
    expiresInSeconds: result.expiresInSeconds,
  });
});
