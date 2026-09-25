import { describeTransactionalCode } from "./codes";
import type { CreditResult, TransactionalResult } from "./types";

/**
 * Turning Melipayamak's answers into results.
 *
 * A pattern send returns a number-as-string whose meaning depends entirely on
 * how long it is: a short one is a status code, a long one is a
 * receipt id. Getting that test wrong in either direction is expensive — a
 * recId read as a code reports a successful send as a failure, and a code read
 * as a recId marks an unsent message delivered and loses the reason.
 *
 * Pure, so every shape below — including the ones that only appear when
 * something has gone wrong — is exercised in tests without touching a network.
 */

/**
 * Shortest value treated as a receipt id.
 *
 * The provider documents "longer than 15 digits". The boundary matters: the largest documented
 * status code is three characters (`-110`), so there is a wide gap between the
 * two populations and no realistic collision. A value of 16+ digits is a recId;
 * anything shorter is looked up as a code.
 */
const REC_ID_MIN_DIGITS = 16;

const DIGITS_ONLY = /^\d+$/;

/** Whether a raw provider value is a receipt id rather than a status code. */
export function looksLikeRecId(raw: string): boolean {
  const trimmed = raw.trim();
  return DIGITS_ONLY.test(trimmed) && trimmed.length >= REC_ID_MIN_DIGITS;
}

/**
 * Parses `SendByBaseNumberResult`, which is a single string.
 *
 * An empty or non-numeric answer is `UNKNOWN` rather than a failure: the
 * difference between "the provider said no" and "the provider said something we
 * do not understand" is the difference between a bug in our pattern and a bug
 * in our parsing, and collapsing them would hide the second one forever.
 */
export function parseTransactionalResult(
  raw: string | null | undefined,
): TransactionalResult {
  const value = (raw ?? "").trim();

  if (!value) {
    return {
      success: false,
      message: "Provider returned an empty response",
      outcome: "UNKNOWN",
    };
  }

  if (looksLikeRecId(value)) {
    return {
      success: true,
      recId: value,
      message: "Sent",
      outcome: "SUCCESS",
    };
  }

  const code = Number(value);
  if (!Number.isInteger(code)) {
    return {
      success: false,
      message: `Unparseable provider response: ${value}`,
      outcome: "UNKNOWN",
    };
  }

  const { message, outcome } = describeTransactionalCode(code);
  return { success: false, code, message, outcome };
}

/**
 * Parses `GetCreditResult`, a single number.
 *
 * **A negative answer is an error code, not a debt.** The account-level
 * refusals — `-110` (API key required), `-109` (IP not allow-listed), `-108`
 * (IP blocked), `-1` (web service disabled) — come back in the same field a
 * balance does, and are checked before any method runs, so they mean the same
 * thing here as on a send. They are looked up in the send-code table for that
 * reason; an unlisted negative is still a failure, reported as unrecognised.
 *
 * Zero stays a balance: an empty account is a real state, and the caller is
 * the one who knows whether it is surprising.
 */
export function parseCreditResult(raw: string | null | undefined): CreditResult {
  const value = (raw ?? "").trim();

  if (!value) {
    return { ok: false, message: "Provider returned an empty response" };
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return { ok: false, message: `Unparseable provider response: ${value}` };
  }

  if (amount < 0) {
    return {
      ok: false,
      code: amount,
      message: describeTransactionalCode(amount).message,
    };
  }

  return { ok: true, credit: amount };
}
