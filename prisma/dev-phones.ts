/**
 * Test sign-in numbers for development accounts.
 *
 * Sign-in is phone + one-time code, so every seeded account needs a mobile
 * number, and the number must be the same on every run: the seeds find their
 * accounts again by it, and `scripts/assign-dev-phones.ts` gave the existing
 * development accounts the same numbers so a re-seed updates rather than
 * duplicates them.
 *
 * Derived from the key the seeds always used to name an account (its old email
 * address), so no table of forty numbers has to be kept in step by hand.
 * Everything lands in 0900 000 0000 – 0900 999 9999. In development no code is
 * ever sent — it is printed to the server console — so these numbers never
 * receive an SMS; they only have to be well-formed and unique.
 */

/** The platform admin, easy to remember. */
export const DEV_ADMIN_PHONE = "09000000000";

const DEV_ADMIN_KEY = "admin@restokar.ir";

/** FNV-1a: stable across runs and machines, which `Math.random` is not. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The test number for the development account the seeds call `key`. */
export function devPhone(key: string): string {
  const normalised = key.trim().toLowerCase();
  if (normalised === DEV_ADMIN_KEY) return DEV_ADMIN_PHONE;

  // 1..9,999,999 — never the admin's 0000000.
  const suffix = (fnv1a(normalised) % 9_999_999) + 1;
  return `0900${String(suffix).padStart(7, "0")}`;
}
