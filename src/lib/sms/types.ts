/**
 * Provider-agnostic SMS contract.
 *
 * Shaped like `payments/types.ts` and for the same reason: Melipayamak is one
 * of several Iranian gateways a venue might end up on (Kavenegar, SMS.ir,
 * Ghasedak), and every one of them can send one approved template to one
 * number. Modelling that here means a second provider is a new file plus a line
 * in the factory, with no change to the features that send.
 *
 * **One operation only.** The API carries one-time codes and nothing else.
 * Promotional messages to many customers deliberately do not go through any
 * provider: they are paid for by the venue and sent by platform staff with a
 * separate tool — see `sms-broadcast.ts`. There is no multi-recipient method on
 * this interface, so no caller can express a bulk send through it.
 *
 * Nothing in this file imports anything, so the result shapes can be asserted
 * in tests without a provider, a database or a network.
 */

// --------------------------------- results ---------------------------------

/**
 * How an attempt ended, in the one vocabulary the whole service speaks.
 *
 * `INVALID_RECIPIENT` exists separately from `FATAL` because the two want
 * different reactions: a malformed number is bad data about one guest and
 * concerns nobody, while a fatal code means the account, the pattern or the
 * message content is wrong and an operator has to act. Collapsing them would
 * either page an admin every time somebody fat-fingers a digit, or bury a
 * suspended account inside per-recipient noise.
 */
export type SmsOutcome =
  "SUCCESS" | "TRANSIENT" | "RATE_LIMIT" | "INVALID_RECIPIENT" | "FATAL" | "UNKNOWN";

/** The result of one pattern send. */
export interface TransactionalResult {
  success: boolean;
  /** Provider receipt id. Present on success; used later with GetDelivery2. */
  recId?: string;
  /** Provider status code. Absent when the call never reached the provider. */
  code?: number;
  /** Operator-facing English detail. Never shown to a guest. */
  message: string;
  outcome: SmsOutcome;
}

/**
 * The answer to a balance query.
 *
 * A union rather than `number | null` because the provider reports failures as
 * numbers too — `-110` arrives in the same field a balance does — and a caller
 * handed a bare number cannot tell the two apart.
 */
export type CreditResult =
  | { ok: true; credit: number }
  | {
      ok: false;
      /** Provider status code. Absent when the answer was not a number. */
      code?: number;
      /** Operator-facing English detail. */
      message: string;
    };

/** A number left out of a recipient list, and why. */
export interface DroppedRecipient {
  /** As supplied, so it can be found in the list it came from. */
  raw: string;
  reason: "INVALID" | "DUPLICATE";
}

// -------------------------------- provider ---------------------------------

/**
 * The raw transport. One implementation talks to Melipayamak; the other logs.
 *
 * Deliberately narrow: it takes already-validated input and returns the
 * provider's own answer. Normalisation and retry live above it, so a new
 * provider never has to reimplement either.
 */
export interface SmsProvider {
  readonly name: string;

  /**
   * One approved pattern message to exactly one number.
   *
   * `variables` are the pattern's placeholder values in the order the approved
   * pattern declares them.
   */
  sendByPattern(input: {
    to: string;
    bodyId: number;
    variables: string[];
  }): Promise<TransactionalResult>;
}

export class SmsError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "SmsError";
  }
}
