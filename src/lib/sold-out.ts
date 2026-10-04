import { startOfDayInZone } from "./time";

/**
 * When a dish marked sold out becomes orderable again.
 *
 * At the next 05:00 in the venue's zone rather than at midnight: plenty of
 * cafés serve past midnight, and a dish switched off at 23:30 must not come
 * back at 00:00 while the same kitchen is still out of it. By five every
 * kitchen has closed and the next delivery is the next day's business.
 *
 * Pure — the caller passes the moment, so a test can state it.
 */
export const SOLD_OUT_RESET_HOUR = 5;

export function soldOutUntil(now: Date): Date {
  const resetToday = new Date(
    startOfDayInZone(now).getTime() + SOLD_OUT_RESET_HOUR * 3_600_000,
  );
  if (resetToday.getTime() > now.getTime()) return resetToday;
  return new Date(startOfDayInZone(now, 1).getTime() + SOLD_OUT_RESET_HOUR * 3_600_000);
}
