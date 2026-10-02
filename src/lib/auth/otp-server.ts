import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { OtpPurpose, Prisma } from "@/generated/prisma/client";
import { fail } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendTransactional } from "@/lib/sms";
import {
  challengeStatus,
  codeRange,
  expiryFrom,
  formatCode,
  resendWaitSeconds,
  type OtpPolicy,
} from "@/lib/sms/otp";

/**
 * One-time SMS codes: issuing, storing, sending and checking them.
 *
 * The rules — expiry, cooldown, the attempt limit, how a code is drawn — are the
 * pure functions in `sms/otp.ts`. This file is the half that touches the
 * database, the SMS provider and the secret.
 *
 * Four properties hold for every caller:
 *
 *   - **The code is never stored.** Only an HMAC of it, keyed with AUTH_SECRET
 *     and bound to the challenge, the number and the purpose. A leaked row or
 *     backup cannot be typed into the code box, and a code issued for one
 *     number or purpose cannot answer another.
 *   - **A code works once, for two minutes, for five guesses.** A new request
 *     deletes the previous unanswered codes for the same number and purpose.
 *   - **Nobody learns whether a number is registered.** The caller decides
 *     `send` from its own lookup, and a request answers identically either way:
 *     the challenge is stored, the cooldown and limits apply, and only the SMS
 *     is skipped. A code that was never sent simply never verifies.
 *   - **In development nothing is sent.** The code is printed to the server
 *     console instead, whatever SMS_PROVIDER says, so test numbers never
 *     receive a message and no credit is spent.
 */

export const OTP_POLICY: OtpPolicy = {
  codeLength: env.OTP_CODE_LENGTH,
  ttlSeconds: env.OTP_TTL_SECONDS,
  resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  maxAttempts: env.OTP_MAX_ATTEMPTS,
};

/**
 * Ceilings on sending, before the per-number cooldown.
 *
 * Every send is paid for, so these bound what one number or one address can
 * cost in an hour: enough for someone who mistypes and retries a few times,
 * far below anything worth abusing.
 */
export const OTP_LIMITS = {
  perPhone: { limit: 5, windowSeconds: 3600 },
  perIp: { limit: 20, windowSeconds: 3600 },
  /** Guesses from one address across all numbers, against spraying. */
  verifyPerIp: { limit: 30, windowSeconds: 600 },
} as const;

type Db = Prisma.TransactionClient | typeof prisma;

function hashCode(challengeId: string, phone: string, purpose: OtpPurpose, code: string) {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`${challengeId}:${phone}:${purpose}:${code}`)
    .digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Whether a production server can actually deliver a code.
 *
 * Checked before anything is stored, and identically for every number, so it
 * reveals nothing about registration. Without it a server left on the mock
 * provider would report "code sent" and nobody could ever sign in.
 */
function smsReady(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (
    env.SMS_PROVIDER === "melipayamak" && !env.SMS_DRY_RUN && env.SMS_PATTERN_OTP > 0
  );
}

export type OtpRequestResult =
  | { ok: true; cooldownSeconds: number; expiresInSeconds: number }
  | {
      ok: false;
      code: "RATE_LIMITED" | "OTP_COOLDOWN" | "SMS_UNAVAILABLE";
      retryAfterSeconds: number;
    };

/**
 * Issues a code for `phone` and sends it when `send` is true.
 *
 * `phone` must already be normalised (`normalisePhone`) and validated as an
 * Iranian mobile. `send` is the caller's decision — "an active account holds
 * this number" for sign-in, "no account holds it" for sign-up — and the
 * response does not depend on it.
 */
export async function requestOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  ip: string;
  send: boolean;
  userId?: string;
  now?: Date;
}): Promise<OtpRequestResult> {
  const now = input.now ?? new Date();

  if (!smsReady()) {
    console.error(
      "[otp] CRITICAL: sign-in codes cannot be delivered. Set SMS_PROVIDER=melipayamak, " +
        "SMS_DRY_RUN=false and SMS_PATTERN_OTP.",
    );
    return { ok: false, code: "SMS_UNAVAILABLE", retryAfterSeconds: 0 };
  }

  const last = await prisma.otpChallenge.findFirst({
    where: { phone: input.phone, purpose: input.purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const wait = resendWaitSeconds(last?.createdAt ?? null, OTP_POLICY, now);
  if (wait > 0) return { ok: false, code: "OTP_COOLDOWN", retryAfterSeconds: wait };

  const [byPhone, byIp] = await Promise.all([
    rateLimit(`otp:phone:${input.phone}`, OTP_LIMITS.perPhone),
    rateLimit(`otp:ip:${input.ip}`, OTP_LIMITS.perIp),
  ]);
  if (!byPhone.allowed || !byIp.allowed) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: Math.max(byPhone.retryAfterSeconds, byIp.retryAfterSeconds),
    };
  }

  const [min, max] = codeRange(OTP_POLICY);
  const code = formatCode(randomInt(min, max + 1), OTP_POLICY);
  const id = randomUUID();

  await prisma.$transaction([
    // A new code makes every earlier unanswered one for this number useless.
    prisma.otpChallenge.deleteMany({
      where: { phone: input.phone, purpose: input.purpose, consumedAt: null },
    }),
    prisma.otpChallenge.create({
      data: {
        id,
        phone: input.phone,
        purpose: input.purpose,
        codeHash: hashCode(id, input.phone, input.purpose, code),
        expiresAt: expiryFrom(now, OTP_POLICY),
        userId: input.userId ?? null,
        createdAt: now,
      },
    }),
  ]);

  if (input.send) {
    if (process.env.NODE_ENV !== "production") {
      // Development only: the code goes to the console instead of a handset.
      console.warn(`[otp:dev] ${input.purpose} code for ${input.phone}: ${code}`);
    } else {
      /*
        Not awaited, on purpose. A registered number waits for the provider and
        an unregistered one does not, so awaiting would let response time say
        which numbers have accounts. `sendTransactional` never throws; a failed
        delivery is logged and alerted there, and the person can resend.
      */
      void sendTransactional({ type: "OTP", phone: input.phone, variables: { code } });
    }
  }

  return {
    ok: true,
    cooldownSeconds: OTP_POLICY.resendCooldownSeconds,
    expiresInSeconds: OTP_POLICY.ttlSeconds,
  };
}

export type OtpVerifyOutcome =
  "VALID" | "INVALID" | "EXPIRED" | "LOCKED" | "RATE_LIMITED";

/**
 * Checks `code` against the newest unanswered challenge for this number and
 * purpose, and consumes it when it matches.
 *
 * Pass `db` to consume inside the caller's transaction, so a sign-up that fails
 * afterwards (a menu address taken a moment ago) rolls the consumption back and
 * the same code can be used again.
 *
 * A wrong guess counts against the code even when the caller's transaction
 * rolls back — it is written outside it — because a limit that resets on error
 * is not a limit.
 */
export async function verifyOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  ip: string;
  userId?: string;
  db?: Db;
  now?: Date;
}): Promise<OtpVerifyOutcome> {
  const now = input.now ?? new Date();
  const db = input.db ?? prisma;

  const byIp = await rateLimit(`otp:verify:${input.ip}`, OTP_LIMITS.verifyPerIp);
  if (!byIp.allowed) return "RATE_LIMITED";

  const challenge = await db.otpChallenge.findFirst({
    where: {
      phone: input.phone,
      purpose: input.purpose,
      consumedAt: null,
      ...(input.userId ? { userId: input.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return "INVALID";

  const blocked = challengeStatus(challenge, OTP_POLICY, now);
  if (blocked === "EXPIRED") return "EXPIRED";
  if (blocked === "TOO_MANY_ATTEMPTS") return "LOCKED";
  if (blocked) return "INVALID";

  const expected = hashCode(challenge.id, input.phone, input.purpose, input.code);

  if (!sameHash(expected, challenge.codeHash)) {
    const updated = await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return updated.attempts >= OTP_POLICY.maxAttempts ? "LOCKED" : "INVALID";
  }

  // Conditional on still being unanswered, so two simultaneous submissions of
  // the same code cannot both succeed.
  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now },
  });
  return consumed.count === 1 ? "VALID" : "INVALID";
}

// ------------------------------ HTTP answers -------------------------------

/**
 * A refused code request as a response.
 *
 * `retryAfterSeconds` rides in `details` so the page can count down to the
 * moment another code may be asked for, rather than guessing.
 */
export function otpRequestFailure(
  result: Extract<OtpRequestResult, { ok: false }>,
): Response {
  // The code length rides along too: after a cooldown the page goes straight to
  // the code box for the code sent moments ago, and must size it correctly.
  const details = {
    retryAfterSeconds: String(result.retryAfterSeconds),
    codeLength: String(OTP_POLICY.codeLength),
  };
  switch (result.code) {
    case "OTP_COOLDOWN":
      return fail(429, "Wait before asking for another code", "OTP_COOLDOWN", details);
    case "RATE_LIMITED":
      return fail(429, "Too many codes requested", "RATE_LIMITED", details);
    case "SMS_UNAVAILABLE":
      return fail(503, "Codes cannot be sent right now", "SMS_UNAVAILABLE");
  }
}

/**
 * A code that did not verify, as a response.
 *
 * One answer for "wrong" and "never sent": a number with no account gets a
 * challenge nobody knows the code to, and it fails exactly like a mistyped
 * code, so the answer says nothing about registration.
 */
export function otpVerifyFailure(outcome: Exclude<OtpVerifyOutcome, "VALID">): Response {
  switch (outcome) {
    case "EXPIRED":
      return fail(400, "Code expired", "OTP_EXPIRED");
    case "LOCKED":
      return fail(400, "Too many wrong codes", "OTP_LOCKED");
    case "RATE_LIMITED":
      return fail(429, "Too many attempts", "RATE_LIMITED");
    case "INVALID":
      return fail(400, "Invalid code", "OTP_INVALID");
  }
}

/** Housekeeping: codes are worthless once expired. Safe to call often. */
export async function pruneOtpChallenges(now: Date = new Date()): Promise<void> {
  await prisma.otpChallenge
    .deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3_600_000) } } })
    .catch(() => undefined);
}
