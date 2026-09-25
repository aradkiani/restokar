import "server-only";
import { env } from "../env";
import { isCritical, isRetryable } from "./codes";
import { MelipayamakProvider } from "./melipayamak";
import { MockSmsProvider } from "./mock";
import {
  orderVariables,
  resolveBodyId,
  type MessageType,
  type PatternIdMap,
} from "./patterns";
import { maskPhone, toSendableNumber } from "./recipients";
import { variablesContainLink } from "./text";
import type { SmsProvider, TransactionalResult } from "./types";

/**
 * The SMS service: one function, and nothing else talks to a provider.
 *
 * `sendTransactional` sends one approved pattern to one number. It exists for
 * one-time codes, and that is the only thing the API is used for.
 *
 * **There is deliberately no bulk send here.** A promotional message to many
 * customers is paid for by the venue and delivered by platform staff with a
 * separate tool — `sms-broadcast.ts` builds the request and the recipient file,
 * and never calls a provider. `sendTransactional` takes a single
 * `phone: string`, so it cannot be looped into a broadcast by passing a list;
 * a caller would have to write the loop, and `sms-broadcast-isolation.test.ts`
 * refuses any broadcast module that imports this one.
 */

// ------------------------------- provider ----------------------------------

let cached: SmsProvider | null = null;

/**
 * Resolves the configured provider.
 *
 * Dry run wins over everything. It is checked before the provider switch rather
 * than inside the Melipayamak client so that turning it on cannot be defeated by
 * a code path that constructs a provider directly.
 */
export function createSmsProvider(): SmsProvider {
  if (cached) return cached;

  if (env.SMS_DRY_RUN || env.SMS_PROVIDER === "mock") {
    cached = new MockSmsProvider();
    return cached;
  }

  cached = new MelipayamakProvider(env.MELIPAYAMAK_USERNAME, env.MELIPAYAMAK_PASSWORD);
  return cached;
}

/** Test seam. Resets the memoised provider so a suite can install a fake. */
export function __setSmsProvider(provider: SmsProvider | null): void {
  cached = provider;
}

const PATTERN_IDS: PatternIdMap = {
  OTP: env.SMS_PATTERN_OTP,
};

// -------------------------------- retry ------------------------------------

/** Backoff between attempts. Three tries: immediate, +1s, +3s. */
const RETRY_DELAYS_MS = [1_000, 3_000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------- send ------------------------------------

export interface TransactionalInput {
  type: MessageType;
  phone: string;
  /** Named values; ordered into the pattern's positions by `orderVariables`. */
  variables: Record<string, string>;
}

/**
 * Sends one pattern message. **Never throws.**
 *
 * Whatever flow asks for a code must not fail because a third-party SOAP
 * endpoint is unreachable. Every failure below returns a result and logs; none
 * propagates.
 *
 * Await it: a person is waiting for the code, and the result is what tells the
 * caller whether to say "code sent" or to offer another try.
 */
export async function sendTransactional(
  input: TransactionalInput,
): Promise<TransactionalResult> {
  const { type, phone, variables } = input;

  const bodyId = resolveBodyId(type, PATTERN_IDS);
  if (bodyId === null) {
    // Not an error: without an approved pattern this message type simply
    // cannot be sent yet.
    return skipped("No approved pattern id configured");
  }

  const to = toSendableNumber(phone);
  if (!to) {
    return skipped("Not a sendable Iranian mobile number");
  }

  const ordered = orderVariables(type, variables);

  // Code -10 costs a call and returns a message that does not say which value
  // was at fault. Checking here names the field instead.
  if (variablesContainLink(ordered)) {
    const result: TransactionalResult = {
      success: false,
      message: "Variables contain a link",
      outcome: "FATAL",
    };
    log(type, to, result);
    return result;
  }

  const provider = createSmsProvider();

  for (let attempt = 0; ; attempt += 1) {
    let result: TransactionalResult;

    try {
      result = await provider.sendByPattern({ to, bodyId, variables: ordered });
    } catch (error) {
      // A network failure is transient by nature, so it joins the retry path
      // rather than ending the send.
      result = {
        success: false,
        message: error instanceof Error ? error.message : "Transport error",
        outcome: "TRANSIENT",
      };
    }

    log(type, to, result);

    if (
      result.success ||
      !isRetryable(result.outcome) ||
      attempt >= RETRY_DELAYS_MS.length
    ) {
      if (isCritical(result.outcome)) alertCritical(type, result);
      return result;
    }

    await delay(RETRY_DELAYS_MS[attempt]!);
  }
}

/**
 * A message that cannot be sent, which is not the same as one that failed.
 *
 * Silent by design: an unconfigured pattern would otherwise log once per
 * request forever, burying the failures that matter. The caller receives the
 * reason in the result.
 */
function skipped(message: string): TransactionalResult {
  return { success: false, message, outcome: "FATAL" };
}

// -------------------------------- logging ----------------------------------

/**
 * One line per *failed* attempt, with the number masked.
 *
 * Never the pattern variables: an OTP in a log file is a credential in a log
 * file. What is recorded is what an operator needs to answer "why did this not
 * arrive" — type, masked number, code, outcome.
 *
 * Successes are deliberately not written here. Project rules allow only `warn`
 * and `error` outside a scheduled script, and routing good news through `warn`
 * is exactly the misuse `backup/run.ts` calls out.
 */
function log(type: MessageType, phone: string, result: TransactionalResult): void {
  if (result.success) return;

  const parts = [
    "[sms]",
    type,
    maskPhone(phone),
    result.code !== undefined ? `code=${result.code}` : "",
    result.outcome,
  ].filter(Boolean);

  console.warn(`${parts.join(" ")} — ${result.message}`);
}

/**
 * Surfaces a configuration or account failure loudly.
 *
 * These are the codes where nothing will send until a human acts — no credit, an
 * unapproved pattern, a blocked IP, a suspended account. They go to `error` so
 * they reach whatever is watching stderr, because the alternative is finding
 * out from a customer who never got their code.
 */
function alertCritical(type: MessageType, result: TransactionalResult): void {
  console.error(`[sms] CRITICAL ${type} code=${result.code ?? "?"} — ${result.message}`);
}

export * from "./types";
export { PATTERNS, MESSAGE_TYPES, type MessageType } from "./patterns";
export { maskPhone } from "./recipients";
