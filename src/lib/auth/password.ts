import { compare, hash } from "bcryptjs";
import { BCRYPT_ROUNDS } from "@/lib/constants";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}

/**
 * Constant-ish work factor for unknown emails: without this, a failed lookup
 * returns far faster than a failed compare and leaks which emails exist.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.aBcDeFgHiJkLmNoPqRsTuVwXyZ012345";

export async function fakeVerify(): Promise<void> {
  await compare("not-a-real-password", DUMMY_HASH).catch(() => false);
}
