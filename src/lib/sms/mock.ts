import "server-only";
import { maskPhone } from "./recipients";
import type { SmsProvider, TransactionalResult } from "./types";

/**
 * A provider that logs instead of sending.
 *
 * Two jobs. It is the default in development and tests, so nobody discovers
 * that a local sign-in flow texted a real number; and it is what
 * `SMS_DRY_RUN=true` selects in production, so an operator can rehearse the OTP
 * flow without spending a message.
 *
 * It returns *successes*, deliberately. A dry run that reported failures would
 * exercise the retry path and the critical-alert path on every rehearsal, and
 * the thing being rehearsed is the happy path.
 *
 * Receipt ids are synthetic but correctly shaped — 18 digits, so that anything
 * downstream which distinguishes a recId from a status code by length is
 * genuinely exercised rather than accidentally taking the other branch.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = "mock";

  async sendByPattern(input: {
    to: string;
    bodyId: number;
    variables: string[];
  }): Promise<TransactionalResult> {
    // `warn`, not `info`: project rules allow only warn and error outside a
    // scheduled script, and "this looked like a send but nothing left the
    // building" is genuinely something an operator should notice in a log.
    console.warn(
      `[sms:dry-run] pattern bodyId=${input.bodyId} to=${maskPhone(input.to)} ` +
        `variables=${input.variables.length}`,
    );

    return {
      success: true,
      recId: syntheticRecId(),
      message: "Dry run — not sent",
      outcome: "SUCCESS",
    };
  }
}

/** 18 digits: long enough to satisfy the recId test in `parse.ts`. */
function syntheticRecId(): string {
  const now = Date.now().toString();
  const noise = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return `${now}${noise}`.slice(0, 18).padEnd(18, "0");
}
