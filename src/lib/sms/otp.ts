/**
 * One-time codes: how long one lives, how often another may be asked for, and
 * when to stop answering.
 *
 * The threat here is not someone guessing a code. It is someone *spending our
 * money*: every request for a code sends a real SMS that the venue pays for, so
 * an unthrottled endpoint is a button an anonymous caller can press to drain a
 * prepaid balance — and the first symptom is a venue whose order confirmations
 * stop going out mid-service. Every limit below exists for that reason first and
 * for credential security second.
 *
 * Pure, and takes `now` as an argument like `availability.ts` and
 * `order-retirement.ts` do, so expiry and cooldown are tested by passing
 * timestamps rather than by waiting.
 */

export interface OtpPolicy {
  /** Digits in the code. Five is the Iranian convention. */
  codeLength: number;
  /** How long a code stays valid. */
  ttlSeconds: number;
  /** Minimum gap between two sends to the same number. */
  resendCooldownSeconds: number;
  /** Wrong guesses before the challenge is burned. */
  maxAttempts: number;
}

export const DEFAULT_OTP_POLICY: OtpPolicy = {
  codeLength: 5,
  ttlSeconds: 120,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
};

/**
 * The stored state of one outstanding challenge.
 *
 * `codeHash` and never the code: a database readable by a support script, a
 * backup archive or a leaked snapshot must not contain something that can be
 * typed straight into the verification box. The hash is produced in
 * `auth/otp-server.ts`, which is also the only place the plaintext ever exists.
 */
export interface OtpChallengeState {
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type OtpVerifyResult =
  "VALID" | "EXPIRED" | "ALREADY_USED" | "TOO_MANY_ATTEMPTS" | "MISMATCH";

/**
 * Whether a challenge can still be answered at all, ignoring the code itself.
 *
 * Checked before comparing hashes so that an expired or exhausted challenge
 * costs no comparison and, more importantly, cannot be used as an oracle: every
 * dead challenge answers identically regardless of what was typed.
 */
export function challengeStatus(
  state: OtpChallengeState,
  policy: OtpPolicy,
  now: Date,
): Exclude<OtpVerifyResult, "VALID" | "MISMATCH"> | null {
  if (state.consumedAt) return "ALREADY_USED";
  if (state.attempts >= policy.maxAttempts) return "TOO_MANY_ATTEMPTS";
  if (now.getTime() >= state.expiresAt.getTime()) return "EXPIRED";
  return null;
}

/**
 * The verdict for one verification attempt.
 *
 * `matches` is computed by the caller with a constant-time comparison — doing it
 * here would mean this module hashing, which would mean importing crypto and
 * losing the property that makes it directly testable.
 */
export function verifyChallenge(
  state: OtpChallengeState,
  matches: boolean,
  policy: OtpPolicy,
  now: Date,
): OtpVerifyResult {
  const blocked = challengeStatus(state, policy, now);
  if (blocked) return blocked;
  return matches ? "VALID" : "MISMATCH";
}

/**
 * Seconds a caller must wait before another code may be sent, or 0.
 *
 * Measured from the last send rather than from the last *successful* send: a
 * code that the provider accepted and the network lost still cost a message, and
 * the cooldown's job is to bound spend, not to be fair about delivery.
 */
export function resendWaitSeconds(
  lastSentAt: Date | null,
  policy: OtpPolicy,
  now: Date,
): number {
  if (!lastSentAt) return 0;

  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000;
  const remaining = policy.resendCooldownSeconds - elapsed;

  return remaining > 0 ? Math.ceil(remaining) : 0;
}

export function canResend(
  lastSentAt: Date | null,
  policy: OtpPolicy,
  now: Date,
): boolean {
  return resendWaitSeconds(lastSentAt, policy, now) === 0;
}

/** When a code created now should stop working. */
export function expiryFrom(now: Date, policy: OtpPolicy): Date {
  return new Date(now.getTime() + policy.ttlSeconds * 1000);
}

/**
 * The numeric range a code is drawn from, as `[min, max]` inclusive.
 *
 * Expressed as a range rather than as "n random digits" so that codes are
 * uniformly distributed across the whole space *including* those starting with
 * zero. Generating digit-by-digit and concatenating is the usual approach and is
 * fine; generating a number and padding is not, because it silently makes
 * `0xxxx` codes unreachable and cuts the keyspace by a tenth.
 */
export function codeRange(policy: OtpPolicy): [number, number] {
  const length = Math.min(Math.max(Math.floor(policy.codeLength) || 5, 4), 8);
  return [0, 10 ** length - 1];
}

/** Zero-pads a drawn number to the policy's width. */
export function formatCode(value: number, policy: OtpPolicy): string {
  const length = Math.min(Math.max(Math.floor(policy.codeLength) || 5, 4), 8);
  return String(Math.abs(Math.trunc(value)))
    .padStart(length, "0")
    .slice(-length);
}
