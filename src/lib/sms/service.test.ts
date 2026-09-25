import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SmsProvider, TransactionalResult } from "./types";

/**
 * The service layer, with the provider faked.
 *
 * Everything here is about what happens *around* a send — how many times we try,
 * what is refused before a call is spent, and what a caller is told afterwards.
 * None of it touches a network.
 *
 * Imported dynamically after the pattern id is set, because `index.ts` reads it
 * from the validated environment once at module load. Setting it afterwards
 * would leave OTP looking unconfigured.
 */
process.env.SMS_PATTERN_OTP = "1001";
process.env.SMS_DRY_RUN = "false";
process.env.SMS_PROVIDER = "mock";

const smsModule = await import("./index");
const { sendTransactional, __setSmsProvider } = smsModule;

/** Records every call so a test can assert what the provider was actually asked. */
class FakeProvider implements SmsProvider {
  readonly name = "fake";
  patternCalls: { to: string; bodyId: number; variables: string[] }[] = [];

  constructor(private readonly patternResults: TransactionalResult[] = []) {}

  async sendByPattern(input: { to: string; bodyId: number; variables: string[] }) {
    this.patternCalls.push(input);
    return (
      this.patternResults[this.patternCalls.length - 1] ??
      this.patternResults.at(-1) ?? {
        success: true,
        recId: "123456789012345678",
        message: "Sent",
        outcome: "SUCCESS" as const,
      }
    );
  }
}

const ok = (): TransactionalResult => ({
  success: true,
  recId: "123456789012345678",
  message: "Sent",
  outcome: "SUCCESS",
});

const transient = (): TransactionalResult => ({
  success: false,
  code: 11,
  message: "Not sent",
  outcome: "TRANSIENT",
});

const fatal = (): TransactionalResult => ({
  success: false,
  code: 2,
  message: "Insufficient credit",
  outcome: "FATAL",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  __setSmsProvider(null);
});

/** Runs a promise that contains backoff sleeps, without waiting in real time. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const result = promise.then((value) => value);
  await vi.runAllTimersAsync();
  return result;
}

const otp = (phone: string, code = "12345") =>
  sendTransactional({ type: "OTP", phone, variables: { code } });

describe("the service surface", () => {
  /**
   * The product decision this module encodes: the API carries one-time codes
   * and nothing else. A bulk function reappearing here would mean promotional
   * messages could once again be sent through the paid API, bypassing the
   * venue-pays broadcast flow.
   */
  it("exposes no way to send one text to many numbers", () => {
    const exported = Object.keys(smsModule);
    expect(exported.some((name) => /bulk|broadcast|many/i.test(name))).toBe(false);
  });
});

describe("sendTransactional", () => {
  it("sends once and returns the receipt id", async () => {
    const provider = new FakeProvider([ok()]);
    __setSmsProvider(provider);

    const result = await settle(otp("09121234567"));

    expect(result.success).toBe(true);
    expect(result.recId).toBe("123456789012345678");
    expect(provider.patternCalls).toHaveLength(1);
    expect(provider.patternCalls[0]!.bodyId).toBe(1001);
    expect(provider.patternCalls[0]!.to).toBe("09121234567");
  });

  it("passes the code as the pattern's only variable, leading zero intact", async () => {
    const provider = new FakeProvider([ok()]);
    __setSmsProvider(provider);

    await settle(otp("09121234567", "04521"));

    expect(provider.patternCalls[0]!.variables).toEqual(["04521"]);
  });

  it("normalises the recipient before sending", async () => {
    const provider = new FakeProvider([ok()]);
    __setSmsProvider(provider);

    await settle(otp("+98 912 123 4567"));

    expect(provider.patternCalls[0]!.to).toBe("09121234567");
  });

  it("retries a transient failure and reports the eventual success", async () => {
    const provider = new FakeProvider([transient(), transient(), ok()]);
    __setSmsProvider(provider);

    const result = await settle(otp("09121234567"));

    expect(provider.patternCalls).toHaveLength(3);
    expect(result.success).toBe(true);
  });

  it("gives up after three attempts", async () => {
    const provider = new FakeProvider([
      transient(),
      transient(),
      transient(),
      transient(),
    ]);
    __setSmsProvider(provider);

    const result = await settle(otp("09121234567"));

    expect(provider.patternCalls).toHaveLength(3);
    expect(result.success).toBe(false);
  });

  /** Retrying "insufficient credit" spends nothing and delays the real alert. */
  it("never retries a fatal code, and raises it loudly", async () => {
    const provider = new FakeProvider([fatal()]);
    __setSmsProvider(provider);

    const result = await settle(otp("09121234567"));

    expect(provider.patternCalls).toHaveLength(1);
    expect(result.outcome).toBe("FATAL");
    expect(console.error).toHaveBeenCalled();
  });

  /** Whatever flow asked for a code must not fail because a gateway is down. */
  it("returns a result rather than throwing when the transport fails", async () => {
    __setSmsProvider({
      name: "broken",
      sendByPattern: () => Promise.reject(new Error("ECONNREFUSED")),
    });

    const result = await settle(otp("09121234567"));

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/ECONNREFUSED/);
  });

  it("refuses a number that cannot receive an SMS without calling the provider", async () => {
    const provider = new FakeProvider([ok()]);
    __setSmsProvider(provider);

    const result = await settle(otp("02188776655"));

    expect(provider.patternCalls).toHaveLength(0);
    expect(result.success).toBe(false);
  });

  /** Code -10, caught locally so the offending value can be named. */
  it("refuses a variable containing a link before spending a call", async () => {
    const provider = new FakeProvider([ok()]);
    __setSmsProvider(provider);

    const result = await settle(otp("09121234567", "restokar.ir"));

    expect(provider.patternCalls).toHaveLength(0);
    expect(result.outcome).toBe("FATAL");
  });
});
