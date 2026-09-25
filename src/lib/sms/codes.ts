import type { SmsOutcome } from "./types";

/**
 * Every status code `SendByBaseNumber` can return, and what to do about each.
 *
 * Here rather than beside the call that receives them, for the same reason
 * `order-status.ts` exists: "is this retryable" is asked by the sender, by the
 * retry loop and by the admin log, and three copies of the answer would drift.
 *
 * **Pattern sends only.** Melipayamak's free-text `SendSimpleSMS` has its own,
 * different code table — `5` there means "sender number invalid", while here
 * there is no `5` at all and pattern mismatch is `-5`. That table was removed
 * along with the bulk method it described, and must not be reintroduced into
 * this one: reading one method's answer against the other's meanings produces a
 * plausible, wrong diagnosis.
 *
 * Pure: no imports beyond a type, so every categorisation is directly testable.
 */

/**
 * A provider code plus how the service should react to it.
 *
 * `message` is English and operator-facing. It is written to logs and shown in
 * the admin console; it is never rendered to a guest, who sees one of the safe
 * Persian strings in `i18n` instead. Leaking "insufficient credit" to a diner
 * tells them something about our billing and nothing useful about their code.
 */
interface CodeMeaning {
  message: string;
  outcome: SmsOutcome;
}

/**
 * Pattern sends. A result of 16+ digits is a recId, not a code — see
 * `parse.ts`; everything in this table is a failure.
 */
export const TRANSACTIONAL_CODES: Record<number, CodeMeaning> = {
  [-110]: {
    message: "Must authenticate with an API key rather than a password",
    outcome: "FATAL",
  },
  [-109]: { message: "Allowed IP is not configured for API use", outcome: "FATAL" },
  [-108]: { message: "IP blocked after repeated failed API attempts", outcome: "FATAL" },
  [-10]: {
    message: "Pattern variables contain a link, which is not permitted",
    outcome: "FATAL",
  },
  [-7]: { message: "Sender number error — contact provider support", outcome: "FATAL" },
  // The one negative code that is worth retrying: an internal fault on their
  // side, not a statement about our request.
  [-6]: { message: "Provider internal error", outcome: "TRANSIENT" },
  [-5]: {
    message: "Text does not match the variables defined in the pattern",
    outcome: "FATAL",
  },
  [-4]: { message: "bodyId is invalid or not approved", outcome: "FATAL" },
  [-3]: { message: "Sender line is not defined in the system", outcome: "FATAL" },
  // Structural misuse: a pattern send takes exactly one number. If this ever
  // appears a caller passed a list, which `sendTransactional` cannot express —
  // so it is a bug, not a condition.
  [-2]: {
    message: "Only one mobile number is allowed per pattern call",
    outcome: "FATAL",
  },
  [-1]: { message: "Access to this web service is disabled", outcome: "FATAL" },
  0: { message: "Wrong username or password", outcome: "FATAL" },
  2: { message: "Insufficient credit", outcome: "FATAL" },
  6: { message: "Provider system is being updated", outcome: "TRANSIENT" },
  7: { message: "Text contains a filtered word", outcome: "FATAL" },
  10: { message: "User account is not active", outcome: "FATAL" },
  11: { message: "Not sent", outcome: "TRANSIENT" },
  12: { message: "User documents are incomplete", outcome: "FATAL" },
  16: { message: "Recipient number not found", outcome: "INVALID_RECIPIENT" },
  17: { message: "SMS text is empty", outcome: "FATAL" },
  18: { message: "Recipient number is invalid", outcome: "INVALID_RECIPIENT" },
  19: { message: "Hourly sending limit exceeded", outcome: "RATE_LIMIT" },
};

const UNKNOWN: CodeMeaning = {
  message: "Unrecognised provider code",
  outcome: "UNKNOWN",
};

export function describeTransactionalCode(code: number): CodeMeaning {
  return TRANSACTIONAL_CODES[code] ?? UNKNOWN;
}

/**
 * Whether another attempt could plausibly succeed.
 *
 * Retrying a `FATAL` wastes credit and delays the alert an operator needs;
 * retrying a `RATE_LIMIT` immediately is how a temporary ceiling becomes a
 * blocked account. Only `TRANSIENT` is retried, and only with backoff.
 */
export function isRetryable(outcome: SmsOutcome): boolean {
  return outcome === "TRANSIENT";
}

/**
 * Whether this is a ceiling to wait out rather than a failure.
 *
 * Code `19`, the hourly limit. A caller should back off rather than retry, and
 * should not treat the number or the pattern as broken.
 */
export function shouldPause(outcome: SmsOutcome): boolean {
  return outcome === "RATE_LIMIT";
}

/**
 * Whether an operator needs to be told immediately.
 *
 * Every one of these means nothing will send until a human changes something —
 * credit, an IP allow-list, account documents, an approved pattern. Silence
 * here is how a venue discovers its codes stopped arriving from a customer.
 */
export function isCritical(outcome: SmsOutcome): boolean {
  return outcome === "FATAL";
}
