import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { normalisePassword } from "./password-rules";

export {
  PASSWORD_MAX,
  PASSWORD_MESSAGES,
  PASSWORD_MIN,
  normalisePassword,
  passwordProblem,
  type PasswordProblem,
} from "./password-rules";

/**
 * How passwords are stored and checked. The rules a new one must meet are in
 * password-rules.ts, shared with the forms.
 *
 * Stored with scrypt, which ships with Node — no native module to build on the
 * server — and is memory-hard, so guessing on a GPU costs what it should. The
 * stored string carries its own parameters (`scrypt$N$r$p$salt$hash`), so they
 * can be raised later without breaking a single existing password.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
/** scrypt needs 128·N·r bytes; leave headroom for the parameters above. */
const MAX_MEMORY = 128 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(normalisePassword(password), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEMORY,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** Whether a stored hash is one this module wrote (and can therefore check). */
export function isPasswordHash(stored: string | null | undefined): stored is string {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

/**
 * Whether a password matches a stored hash. Constant-time on the comparison;
 * false — never a throw — for anything malformed.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!isPasswordHash(stored)) return false;
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [, n, r, p, saltText, keyText] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (![N, R, P].every((x) => Number.isInteger(x) && x > 0)) return false;
  const expected = Buffer.from(keyText!, "base64");
  if (expected.length === 0) return false;
  try {
    const actual = await scrypt(
      normalisePassword(password),
      Buffer.from(saltText!, "base64"),
      expected.length,
      { N, r: R, p: P, maxmem: MAX_MEMORY },
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A hash to compare against when the account does not exist or has no
 * password, so a wrong number takes as long to refuse as a wrong password and
 * the response time does not reveal which numbers are registered.
 */
let decoy: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword("decoy-password-0");
  return decoy;
}
