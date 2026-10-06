import "server-only";
import { prisma } from "../prisma";
import { rateLimit } from "../rate-limit";

/**
 * Wrong-password limits for sign-in.
 *
 * Counted on failures only, so someone who types their password right is never
 * slowed down, and per number as well as per address: the per-number count
 * stops a guesser working through one account from many addresses, the
 * per-address count stops one machine working through many accounts.
 *
 * Both live in the same Postgres-backed counters as every other limit
 * (rate-limit.ts), so they hold across all app instances.
 */
export const LOGIN_LIMITS = {
  /** Five wrong passwords for one number lock it for fifteen minutes. */
  perPhone: { limit: 5, windowSeconds: 15 * 60 },
  /** Twenty wrong passwords from one address, across any numbers. */
  perIp: { limit: 20, windowSeconds: 15 * 60 },
} as const;

const phoneKey = (phone: string) => `login-fail:phone:${phone}`;
const ipKey = (ip: string) => `login-fail:ip:${ip}`;

/** Seconds until sign-in is allowed again, or 0 when it is allowed now. */
export async function loginLockedFor(phone: string, ip: string): Promise<number> {
  const rows = await prisma.rateLimit.findMany({
    where: { key: { in: [phoneKey(phone), ipKey(ip)] }, resetAt: { gt: new Date() } },
    select: { key: true, count: true, resetAt: true },
  });
  let wait = 0;
  for (const row of rows) {
    const limit =
      row.key === phoneKey(phone)
        ? LOGIN_LIMITS.perPhone.limit
        : LOGIN_LIMITS.perIp.limit;
    if (row.count >= limit) {
      wait = Math.max(wait, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
    }
  }
  return wait;
}

export async function recordLoginFailure(phone: string, ip: string): Promise<void> {
  await rateLimit(phoneKey(phone), LOGIN_LIMITS.perPhone);
  await rateLimit(ipKey(ip), LOGIN_LIMITS.perIp);
}

/** A correct password clears that number's count; the address count stays. */
export async function clearLoginFailures(phone: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: phoneKey(phone) } });
}
