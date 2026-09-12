import { DAY_MS } from "./constants";

/**
 * Manual onboarding — the stand-in for the payment gateway.
 *
 * While checkout is switched off, platform staff create accounts by hand and
 * grant a subscription period directly. This module holds the part of that
 * which is pure arithmetic, so it can be tested without a database.
 */

/**
 * When a subscription granted today for `days` should lapse.
 *
 * Plain millisecond arithmetic rather than calendar month maths: staff are
 * granting "thirty days", not "one month", and the two disagree by up to three
 * days depending on where in the year the sale lands. It also keeps the time of
 * day, so a period granted at 4pm ends at 4pm — truncating to midnight would
 * quietly shorten every subscription by part of a day.
 */
export function subscriptionEndFromDays(days: number, from: Date): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * Adds whole calendar months, clamping to the last valid day of the target
 * month.
 *
 * `Date.prototype.setMonth` overflows instead of clamping: on a subscription
 * renewed 31 January, `setMonth(getMonth() + 1)` produces 3 March, because 31
 * February rolls forward. The customer is silently billed for a period ending
 * two days after the one they bought, and the error compounds on every renewal
 * that lands on a long month. Clamping gives 28 (or 29) February, which is what
 * "one month later" means everywhere outside a date library.
 *
 * Used for gateway-settled renewals, where the term genuinely is "a month" or
 * "a year" rather than a counted number of days.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const targetMonth = result.getMonth() + months;

  // Move to the first of the target month before restoring the day, so the
  // intermediate value can never overflow into the month after it.
  const dayOfMonth = result.getDate();
  result.setDate(1);
  result.setMonth(targetMonth);

  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();

  result.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return result;
}
