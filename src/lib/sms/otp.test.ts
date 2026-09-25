import { describe, expect, it } from "vitest";
import {
  canResend,
  challengeStatus,
  codeRange,
  DEFAULT_OTP_POLICY,
  expiryFrom,
  formatCode,
  resendWaitSeconds,
  verifyChallenge,
  type OtpChallengeState,
} from "./otp";

const NOW = new Date("2026-09-23T12:00:00.000Z");

function challenge(overrides: Partial<OtpChallengeState> = {}): OtpChallengeState {
  return {
    codeHash: "hashed",
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 120_000),
    attempts: 0,
    consumedAt: null,
    ...overrides,
  };
}

describe("expiry", () => {
  it("expires a code two minutes after it was issued by default", () => {
    expect(expiryFrom(NOW, DEFAULT_OTP_POLICY).toISOString()).toBe(
      "2026-09-23T12:02:00.000Z",
    );
  });

  it("accepts a code inside its window", () => {
    const at = new Date(NOW.getTime() + 119_000);
    expect(verifyChallenge(challenge(), true, DEFAULT_OTP_POLICY, at)).toBe("VALID");
  });

  it("refuses a code the moment it expires", () => {
    const at = new Date(NOW.getTime() + 120_000);
    expect(verifyChallenge(challenge(), true, DEFAULT_OTP_POLICY, at)).toBe("EXPIRED");
  });
});

describe("verifyChallenge", () => {
  it("accepts the right code and rejects the wrong one", () => {
    expect(verifyChallenge(challenge(), true, DEFAULT_OTP_POLICY, NOW)).toBe("VALID");
    expect(verifyChallenge(challenge(), false, DEFAULT_OTP_POLICY, NOW)).toBe("MISMATCH");
  });

  it("refuses a code that has already been used", () => {
    const used = challenge({ consumedAt: NOW });
    expect(verifyChallenge(used, true, DEFAULT_OTP_POLICY, NOW)).toBe("ALREADY_USED");
  });

  it("stops answering once the attempt budget is spent", () => {
    const spent = challenge({ attempts: DEFAULT_OTP_POLICY.maxAttempts });
    expect(verifyChallenge(spent, true, DEFAULT_OTP_POLICY, NOW)).toBe(
      "TOO_MANY_ATTEMPTS",
    );
  });

  /**
   * A dead challenge must answer identically whatever was typed, or the endpoint
   * becomes an oracle for whether a guess was right.
   */
  it("gives a dead challenge the same answer for a right and a wrong code", () => {
    const dead = challenge({ attempts: 99 });

    expect(verifyChallenge(dead, true, DEFAULT_OTP_POLICY, NOW)).toBe(
      verifyChallenge(dead, false, DEFAULT_OTP_POLICY, NOW),
    );
  });

  it("reports the most serious reason first", () => {
    const every = challenge({
      consumedAt: NOW,
      attempts: 99,
      expiresAt: new Date(NOW.getTime() - 1),
    });
    expect(challengeStatus(every, DEFAULT_OTP_POLICY, NOW)).toBe("ALREADY_USED");
  });
});

describe("resend cooldown", () => {
  /** The limit that bounds spend: every resend is a message somebody pays for. */
  it("allows the first send immediately", () => {
    expect(canResend(null, DEFAULT_OTP_POLICY, NOW)).toBe(true);
    expect(resendWaitSeconds(null, DEFAULT_OTP_POLICY, NOW)).toBe(0);
  });

  it("refuses a second send inside the cooldown and says how long to wait", () => {
    const sentAt = new Date(NOW.getTime() - 20_000);

    expect(canResend(sentAt, DEFAULT_OTP_POLICY, NOW)).toBe(false);
    expect(resendWaitSeconds(sentAt, DEFAULT_OTP_POLICY, NOW)).toBe(40);
  });

  it("allows another send once the cooldown has elapsed", () => {
    const sentAt = new Date(NOW.getTime() - 60_000);
    expect(canResend(sentAt, DEFAULT_OTP_POLICY, NOW)).toBe(true);
  });

  it("never reports a negative wait", () => {
    const old = new Date(NOW.getTime() - 3_600_000);
    expect(resendWaitSeconds(old, DEFAULT_OTP_POLICY, NOW)).toBe(0);
  });
});

describe("code shape", () => {
  it("draws from the full space including codes that start with zero", () => {
    expect(codeRange(DEFAULT_OTP_POLICY)).toEqual([0, 99_999]);
  });

  /**
   * Padding rather than re-drawing is what keeps `0xxxx` reachable. Generating a
   * number in `[10000, 99999]` would look correct and quietly cut the keyspace
   * by a tenth.
   */
  it("zero-pads to the configured width", () => {
    expect(formatCode(42, DEFAULT_OTP_POLICY)).toBe("00042");
    expect(formatCode(99_999, DEFAULT_OTP_POLICY)).toBe("99999");
    expect(formatCode(0, DEFAULT_OTP_POLICY)).toBe("00000");
  });

  it("honours a configured length", () => {
    const six = { ...DEFAULT_OTP_POLICY, codeLength: 6 };
    expect(codeRange(six)).toEqual([0, 999_999]);
    expect(formatCode(42, six)).toBe("000042");
  });

  it("clamps an absurd configured length rather than producing a useless code", () => {
    expect(formatCode(1, { ...DEFAULT_OTP_POLICY, codeLength: 1 })).toHaveLength(4);
    expect(formatCode(1, { ...DEFAULT_OTP_POLICY, codeLength: 40 })).toHaveLength(8);
  });
});
