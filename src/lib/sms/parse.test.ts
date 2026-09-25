import { describe, expect, it } from "vitest";
import { looksLikeRecId, parseCreditResult, parseTransactionalResult } from "./parse";

/**
 * A pattern send answers with a number-as-string whose meaning depends
 * entirely on its length. These tests pin that boundary, because
 * getting it wrong in either direction is silent: a recId read as a code reports
 * a delivered message as failed, and a code read as a recId marks an unsent
 * message delivered and throws away the reason.
 */

describe("looksLikeRecId", () => {
  it("treats 16+ digits as a receipt id", () => {
    expect(looksLikeRecId("1234567890123456")).toBe(true);
    expect(looksLikeRecId("987654321098765432")).toBe(true);
  });

  it("treats everything shorter as a status code", () => {
    expect(looksLikeRecId("123456789012345")).toBe(false);
    expect(looksLikeRecId("2")).toBe(false);
    expect(looksLikeRecId("-110")).toBe(false);
  });

  it("refuses anything that is not purely digits", () => {
    expect(looksLikeRecId("12345678901234567x")).toBe(false);
    expect(looksLikeRecId("")).toBe(false);
  });
});

describe("parseTransactionalResult", () => {
  it("reads a long numeric answer as a successful send", () => {
    const result = parseTransactionalResult("9876543210987654");

    expect(result.success).toBe(true);
    expect(result.recId).toBe("9876543210987654");
    expect(result.outcome).toBe("SUCCESS");
  });

  it("tolerates surrounding whitespace from the XML body", () => {
    expect(parseTransactionalResult("  9876543210987654  ").recId).toBe(
      "9876543210987654",
    );
  });

  it("maps each documented error code to its meaning", () => {
    expect(parseTransactionalResult("0").message).toMatch(/username or password/i);
    expect(parseTransactionalResult("2").message).toMatch(/credit/i);
    expect(parseTransactionalResult("-4").message).toMatch(/bodyId/i);
    expect(parseTransactionalResult("-5").message).toMatch(/pattern/i);
  });

  /** Only these three are worth another attempt; the rest waste credit. */
  it("categorises the retryable codes and nothing else", () => {
    expect(parseTransactionalResult("-6").outcome).toBe("TRANSIENT");
    expect(parseTransactionalResult("6").outcome).toBe("TRANSIENT");
    expect(parseTransactionalResult("11").outcome).toBe("TRANSIENT");

    expect(parseTransactionalResult("2").outcome).toBe("FATAL");
    expect(parseTransactionalResult("-110").outcome).toBe("FATAL");
  });

  it("treats the hourly ceiling as a pause rather than a failure", () => {
    expect(parseTransactionalResult("19").outcome).toBe("RATE_LIMIT");
  });

  /** A bad number is one guest's problem, not an account-wide alarm. */
  it("separates a bad recipient from a configuration fault", () => {
    expect(parseTransactionalResult("16").outcome).toBe("INVALID_RECIPIENT");
    expect(parseTransactionalResult("18").outcome).toBe("INVALID_RECIPIENT");
  });

  it("reports an empty or unreadable answer as unknown rather than as failure", () => {
    expect(parseTransactionalResult("").outcome).toBe("UNKNOWN");
    expect(parseTransactionalResult(null).outcome).toBe("UNKNOWN");
    expect(parseTransactionalResult("not-a-number").outcome).toBe("UNKNOWN");
  });
});

/**
 * GetCredit answers failures in the same field as the balance. The first live
 * run printed "Credit: -110" and exited 0 — an account refusal read as a debt.
 */
describe("parseCreditResult", () => {
  it("reads a non-negative number as the balance", () => {
    expect(parseCreditResult("15230.5")).toEqual({ ok: true, credit: 15230.5 });
    expect(parseCreditResult(" 42 ")).toEqual({ ok: true, credit: 42 });
  });

  it("keeps zero as a balance, not an error", () => {
    expect(parseCreditResult("0")).toEqual({ ok: true, credit: 0 });
  });

  it("reads a negative answer as an error code, looked up in the code table", () => {
    const result = parseCreditResult("-110");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(-110);
    expect(result.message).toMatch(/API key/i);

    expect(parseCreditResult("-109")).toMatchObject({ ok: false, code: -109 });
    expect(parseCreditResult("-108")).toMatchObject({ ok: false, code: -108 });
  });

  it("still fails on a negative code the table does not know", () => {
    expect(parseCreditResult("-999")).toMatchObject({
      ok: false,
      code: -999,
      message: expect.stringMatching(/unrecognised/i),
    });
  });

  it("fails on an empty or unreadable answer", () => {
    expect(parseCreditResult("").ok).toBe(false);
    expect(parseCreditResult(null).ok).toBe(false);
    expect(parseCreditResult("not-a-number").ok).toBe(false);
  });
});
