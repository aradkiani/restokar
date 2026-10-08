import { createHmac } from "node:crypto";
import pg from "pg";
import { DEV_ADMIN_PHONE } from "../../prisma/dev-phones";
import { ADMIN_PASSWORD, DEMO_PASSWORD } from "../../prisma/demo/catalog";

/**
 * Test-only access to the local database.
 *
 * Sign-in codes are never readable through the app — they are stored only as
 * an HMAC. To walk the real sign-in screens, a journey asks for a code like a
 * person would, then this helper replaces that challenge's hash with the hash
 * of a code the test knows. Everything after that — typing the code, the
 * server's verification, the session cookie — is the production path. Nothing
 * in the application changes for tests.
 *
 * Refuses to touch anything but a local database, like the seed scripts.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Already in the environment.
}

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1"].includes(host) || process.env.NODE_ENV === "production") {
  throw new Error("E2E helpers refuse to run against a non-local database.");
}

export const db = new pg.Pool({ connectionString: url, max: 2 });

const CODE_LENGTH = Number(process.env.OTP_CODE_LENGTH ?? 5);
export const KNOWN_CODE = "135792".slice(0, CODE_LENGTH);

/**
 * Accounts from `prisma/seed-demo.ts` (see prisma/demo/catalog.ts): one per
 * plan and state the journeys need. Every one signs in with DEMO_PASSWORD; the
 * platform admin with ADMIN_PASSWORD.
 */
export const PHONES = {
  admin: DEV_ADMIN_PHONE,
  /** کافه نیمکت — small plan, active, exactly its 10 tables, no staff. */
  smallOwner: "09120000001",
  /** کافه کتاب ورق — small plan on trial, menu only. */
  trialOwner: "09120000002",
  /** شیرینی و قهوه گلپر — small plan, expired nine days ago. */
  expiredOwner: "09120000003",
  /** سفره‌خانه شمشاد — medium plan, yearly. */
  mediumOwner: "09120000004",
  /** برگرخانه دودی — large plan, open until 02:00, takeaway and online payment. */
  largeOwner: "09120000005",
  largeCashier: "09120000006",
  largeAccountant: "09120000007",
  largeMenuStaff: "09120000008",
  largeStorekeeper: "09120000009",
  /** پیتزا تنور — chain plan, head office plus three branches. */
  chainOwner: "09120000013",
  vanakManager: "09120000015",
  vanakCashier: "09120000016",
} as const;

export const SLUGS = {
  small: "cafe-nimkat",
  trial: "cafe-varagh",
  expired: "golpar",
  medium: "shemshad",
  large: "dudi-burger",
  chain: "pizza-tanoor",
  vanak: "pizza-tanoor-vanak",
  tajrish: "pizza-tanoor-tajrish",
} as const;

export { ADMIN_PASSWORD, DEMO_PASSWORD };

/** The password a fixture account signs in with. */
export const passwordFor = (phone: string) =>
  phone === DEV_ADMIN_PHONE ? ADMIN_PASSWORD : DEMO_PASSWORD;

/**
 * Forgets earlier codes for `phone`, so the 60-second resend cooldown from a
 * previous journey does not stop this one from getting a fresh code.
 */
export async function forgetCodes(phone: string): Promise<void> {
  await db.query(`DELETE FROM "OtpChallenge" WHERE phone = $1`, [phone]);
}

/** Forget sign-in and ordering counters so repeated runs are not locked out. */
export async function clearRateLimits(): Promise<void> {
  await db.query(
    `DELETE FROM "RateLimit" WHERE key LIKE 'otp:%' OR key LIKE 'register:%'
       OR key LIKE 'order:%' OR key LIKE 'login-fail:%' OR key LIKE 'password-change:%' OR key LIKE 'staff-call:%' OR key LIKE 'upload:%'`,
  );
}

/**
 * Makes the newest unanswered code for `phone` equal to KNOWN_CODE.
 * Call it after the code was requested (through the UI or the API).
 */
export async function setKnownCode(
  phone: string,
  purpose: "LOGIN" | "SIGNUP" | "CHANGE_PHONE" = "LOGIN",
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM "OtpChallenge"
        WHERE phone = $1 AND purpose = $2 AND "consumedAt" IS NULL
        ORDER BY "createdAt" DESC LIMIT 1`,
      [phone, purpose],
    );
    const id = rows[0]?.id;
    if (id) {
      const hash = createHmac("sha256", process.env.AUTH_SECRET as string)
        .update(`${id}:${phone}:${purpose}:${KNOWN_CODE}`)
        .digest("hex");
      await db.query(`UPDATE "OtpChallenge" SET "codeHash" = $1 WHERE id = $2`, [
        hash,
        id,
      ]);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No code was issued for ${phone}`);
}

export async function one<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  if (!rows[0]) throw new Error(`No row for: ${sql}`);
  return rows[0];
}
