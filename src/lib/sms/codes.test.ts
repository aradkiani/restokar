import { describe, expect, it } from "vitest";
import {
  describeTransactionalCode,
  isCritical,
  isRetryable,
  shouldPause,
  TRANSACTIONAL_CODES,
} from "./codes";

describe("the pattern-send code table", () => {
  /**
   * The free-text method's table was removed with the method. Its `5` meant
   * "sender number invalid"; pattern sends have no `5` at all, and their pattern
   * mismatch is `-5`. Pinning both keeps the old meaning from being pasted back.
   */
  it("has no positive 5, and reads -5 as a pattern mismatch", () => {
    expect(TRANSACTIONAL_CODES[5]).toBeUndefined();
    expect(describeTransactionalCode(-5).message).toMatch(/pattern/i);
  });

  it("describes the account failures an operator must act on", () => {
    expect(describeTransactionalCode(0).message).toMatch(/username or password/i);
    expect(describeTransactionalCode(2).message).toMatch(/credit/i);
    expect(describeTransactionalCode(-4).message).toMatch(/bodyId/i);
  });
});

describe("categorisation", () => {
  it("retries only genuinely transient failures", () => {
    for (const code of [-6, 6, 11]) {
      expect(isRetryable(describeTransactionalCode(code).outcome), String(code)).toBe(
        true,
      );
    }
  });

  /** Retrying any of these burns credit and delays the alert that matters. */
  it("never retries a configuration, account or content fault", () => {
    for (const code of [
      -110, -109, -108, -10, -7, -5, -4, -3, -2, -1, 0, 2, 7, 10, 12, 17,
    ]) {
      const outcome = describeTransactionalCode(code).outcome;
      expect(isRetryable(outcome), String(code)).toBe(false);
      expect(isCritical(outcome), String(code)).toBe(true);
    }
  });

  it("waits out the hourly ceiling rather than failing or retrying", () => {
    const outcome = describeTransactionalCode(19).outcome;
    expect(shouldPause(outcome)).toBe(true);
    expect(isRetryable(outcome)).toBe(false);
    expect(isCritical(outcome)).toBe(false);
  });

  /**
   * A mistyped digit must not page an admin, and a suspended account must not be
   * filed away as one guest's bad number.
   */
  it("keeps a bad recipient distinct from a critical fault", () => {
    for (const code of [16, 18]) {
      const outcome = describeTransactionalCode(code).outcome;
      expect(outcome).toBe("INVALID_RECIPIENT");
      expect(isCritical(outcome)).toBe(false);
      expect(isRetryable(outcome)).toBe(false);
    }
  });

  it("reports an undocumented code as unknown rather than guessing", () => {
    expect(describeTransactionalCode(-999).outcome).toBe("UNKNOWN");
    expect(isRetryable("UNKNOWN")).toBe(false);
  });
});
