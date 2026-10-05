import { toEnglishDigits } from "../format";

/**
 * The rules a new password must meet, shared by the forms and the server.
 *
 * Free of any Node import so the sign-up and change-password forms can check a
 * password as it is typed with exactly the rules the server enforces. Hashing
 * lives in password.ts.
 *
 * Persian and Arabic digits are read as their ASCII twins: a phone keyboard
 * switches digit sets with the language, and "۱۲۳" and "123" must be the same
 * password or people get locked out by their own keyboard.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * The few passwords every guesser tries first. A short list on purpose: the
 * length and letter-plus-digit rules already rule out most of the long tail.
 */
const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "password123",
  "qwerty123",
  "qwertyuiop",
  "1q2w3e4r",
  "1qaz2wsx",
  "abc12345",
  "abcd1234",
  "aa123456",
  "iloveyou1",
  "admin123",
  "restokar1",
  "restokar123",
]);

/** What a password is compared as. */
export function normalisePassword(password: string): string {
  return toEnglishDigits(password.normalize("NFC"));
}

export type PasswordProblem =
  "TOO_SHORT" | "TOO_LONG" | "NEEDS_LETTER" | "NEEDS_DIGIT" | "IS_PHONE" | "TOO_COMMON";

/**
 * Why a new password is not acceptable, or null when it is.
 *
 * Eight characters with at least one letter and one digit — long enough to
 * resist guessing behind the login rate limit, short enough to type on a phone
 * at a counter. Persian letters count as letters.
 */
export function passwordProblem(
  password: string,
  context: { phone?: string | null } = {},
): PasswordProblem | null {
  const value = normalisePassword(password);
  if (value.length < PASSWORD_MIN) return "TOO_SHORT";
  if (value.length > PASSWORD_MAX) return "TOO_LONG";
  if (!/\p{L}/u.test(value)) return "NEEDS_LETTER";
  if (!/\d/.test(value)) return "NEEDS_DIGIT";
  const phone = context.phone ? toEnglishDigits(context.phone) : null;
  if (phone && (value.includes(phone) || value.includes(phone.slice(1)))) {
    return "IS_PHONE";
  }
  if (COMMON.has(value.toLowerCase())) return "TOO_COMMON";
  return null;
}

/** The message shown for each problem, in Persian like every form message. */
export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  TOO_SHORT: `رمز عبور باید دست‌کم ${PASSWORD_MIN} نویسه باشد`,
  TOO_LONG: "رمز عبور بیش از حد بلند است",
  NEEDS_LETTER: "رمز عبور باید دست‌کم یک حرف داشته باشد",
  NEEDS_DIGIT: "رمز عبور باید دست‌کم یک رقم داشته باشد",
  IS_PHONE: "شماره موبایل را رمز عبور قرار ندهید",
  TOO_COMMON: "این رمز عبور بسیار رایج است؛ رمز دیگری انتخاب کنید",
};
