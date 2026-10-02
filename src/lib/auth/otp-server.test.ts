import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The code rules end to end, against an in-memory stand-in for the one table
 * `otp-server.ts` uses. The rules themselves are pure and tested in
 * `sms/otp.test.ts`; what is tested here is the part that stores, invalidates,
 * consumes and locks — the part a mistake would turn into a way in.
 *
 * In tests (as in development) the code is printed rather than texted, so each
 * test reads the code it was "sent" from that line, exactly as a developer does.
 */

interface Row {
  id: string;
  phone: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  userId: string | null;
  createdAt: Date;
}

const rows: Row[] = [];

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, want]) => {
    const have = row[key as keyof Row];
    if (want === null) return have === null;
    if (want && typeof want === "object" && "lt" in want) {
      return (have as Date).getTime() < (want.lt as Date).getTime();
    }
    return have === want;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpChallenge: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: { createdAt: "asc" | "desc" };
      }) => {
        const direction = orderBy?.createdAt === "asc" ? 1 : -1;
        return (
          rows
            .filter((row) => matches(row, where))
            .sort(
              (a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()),
            )[0] ?? null
        );
      },
      create: async ({ data }: { data: Partial<Row> }) => {
        const row = { attempts: 0, consumedAt: null, userId: null, ...data } as Row;
        rows.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const keep = rows.filter((row) => !matches(row, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { attempts: { increment: number } };
      }) => {
        const row = rows.find((r) => r.id === where.id)!;
        row.attempts += data.attempts.increment;
        return { attempts: row.attempts };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<Row>;
      }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 99, retryAfterSeconds: 0 }),
}));

const sendTransactional = vi.fn(async () => ({
  success: true,
  message: "Sent",
  outcome: "SUCCESS",
}));
vi.mock("@/lib/sms", () => ({ sendTransactional }));

const { OTP_POLICY, requestOtp, verifyOtp } = await import("./otp-server");

const PHONE = "09121234567";
const T0 = new Date("2026-09-28T10:00:00Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

let printed: string[] = [];

beforeEach(() => {
  rows.splice(0);
  printed = [];
  sendTransactional.mockClear();
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    printed.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The code the last request "sent", read from the development console line. */
function lastCode(): string {
  const line = printed.at(-1) ?? "";
  return /(\d{5,6})$/.exec(line)?.[1] ?? "";
}

async function issue(overrides: Partial<Parameters<typeof requestOtp>[0]> = {}) {
  return requestOtp({
    phone: PHONE,
    purpose: "LOGIN",
    ip: "1.1.1.1",
    send: true,
    now: T0,
    ...overrides,
  });
}

async function check(
  code: string,
  overrides: Partial<Parameters<typeof verifyOtp>[0]> = {},
) {
  return verifyOtp({
    phone: PHONE,
    purpose: "LOGIN",
    code,
    ip: "1.1.1.1",
    now: later(10),
    ...overrides,
  });
}

describe("issuing a code", () => {
  it("draws a code of the configured length", async () => {
    const result = await issue();
    expect(result.ok).toBe(true);
    expect(lastCode()).toHaveLength(OTP_POLICY.codeLength);
  });

  it("stores a hash, never the code", async () => {
    await issue();
    const code = lastCode();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
    expect(JSON.stringify(rows)).not.toContain(`"${code}"`);
  });

  it("prints the code instead of texting it outside production", async () => {
    await issue();
    expect(sendTransactional).not.toHaveBeenCalled();
    expect(printed.at(-1)).toContain(PHONE);
  });

  it("refuses a second request inside the cooldown and says how long to wait", async () => {
    await issue();
    const again = await issue({ now: later(20) });
    expect(again).toEqual({
      ok: false,
      code: "OTP_COOLDOWN",
      retryAfterSeconds: OTP_POLICY.resendCooldownSeconds - 20,
    });
  });

  /**
   * The answer must not depend on whether a code was actually sent: that is
   * what keeps "is this number registered?" unanswerable.
   */
  it("answers identically when nothing is sent, and sends nothing", async () => {
    const sent = await issue();
    rows.splice(0);
    printed = [];
    const skipped = await issue({ send: false });

    expect(skipped).toEqual(sent);
    expect(printed).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it("refuses in production when SMS is not configured, storing nothing", async () => {
    const original = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    try {
      const result = await issue();
      expect(result).toMatchObject({ ok: false, code: "SMS_UNAVAILABLE" });
      expect(rows).toHaveLength(0);
    } finally {
      vi.stubEnv("NODE_ENV", original ?? "test");
    }
  });
});

describe("checking a code", () => {
  it("accepts the right code once, and only once", async () => {
    await issue();
    const code = lastCode();
    expect(await check(code)).toBe("VALID");
    expect(await check(code)).toBe("INVALID");
  });

  it("rejects a wrong code", async () => {
    await issue();
    const wrong = lastCode() === "00000" ? "11111" : "00000";
    expect(await check(wrong)).toBe("INVALID");
  });

  it("locks after the attempt limit, even against the right code", async () => {
    await issue();
    const code = lastCode();
    const wrong = code === "00000" ? "11111" : "00000";
    const outcomes = [];
    for (let i = 0; i < OTP_POLICY.maxAttempts; i += 1) outcomes.push(await check(wrong));

    expect(outcomes.at(-1)).toBe("LOCKED");
    expect(await check(code)).toBe("LOCKED");
  });

  it("expires after its lifetime", async () => {
    await issue();
    expect(await check(lastCode(), { now: later(OTP_POLICY.ttlSeconds + 1) })).toBe(
      "EXPIRED",
    );
  });

  it("stops accepting an old code once a new one is requested", async () => {
    await issue();
    const first = lastCode();
    await issue({ now: later(OTP_POLICY.resendCooldownSeconds + 1) });
    const second = lastCode();

    const at = later(OTP_POLICY.resendCooldownSeconds + 5);
    if (first !== second) expect(await check(first, { now: at })).toBe("INVALID");
    expect(await check(second, { now: at })).toBe("VALID");
  });

  it("never accepts a code that was not sent", async () => {
    await issue({ send: false });
    // Nobody knows this code; any guess fails like a wrong code.
    expect(await check("12345")).toBe("INVALID");
  });

  it("does not let a code for one purpose answer another", async () => {
    await issue({ purpose: "LOGIN" });
    expect(await check(lastCode(), { purpose: "SIGNUP" })).toBe("INVALID");
  });

  it("binds a phone-change code to the account that asked for it", async () => {
    await issue({ purpose: "CHANGE_PHONE", userId: "user-a" });
    const code = lastCode();
    expect(await check(code, { purpose: "CHANGE_PHONE", userId: "user-b" })).toBe(
      "INVALID",
    );
    expect(await check(code, { purpose: "CHANGE_PHONE", userId: "user-a" })).toBe(
      "VALID",
    );
  });
});
