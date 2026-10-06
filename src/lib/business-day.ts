import { MINUTES_PER_DAY, zonedMidnight, zonedParts } from "./time";

/**
 * A venue's business day: when it opens and closes, and which day an order
 * belongs to.
 *
 * A café open from 17:00 to 03:00 has one business day per evening, not two
 * half-days split at midnight. Every order is filed under a business date when
 * it is placed (`Order.businessDate`), and every report groups by that date.
 *
 * **Where one business day ends and the next begins** is the middle of the
 * hours the venue is closed: for 17:00–03:00 the closed stretch is 03:00 →
 * 17:00 and the day changes at 10:00, so an order at 01:30 is the previous
 * evening's and an early 11:00 delivery order is today's. Halfway is the point
 * furthest from any real service, which is what makes it safe for orders a
 * little before opening or a little after closing. A venue open around the
 * clock (start equals end) changes day at its opening time.
 *
 * A business date is named after the calendar date on which that day
 * **opens**. Iran's single zone (APP_TIME_ZONE) and no daylight saving mean a
 * business day is always exactly 24 hours.
 *
 * Isomorphic and pure: the settings form shows the cut-off with exactly the
 * rule the server files orders by.
 */

export interface BusinessHours {
  /** Opening time, minutes after midnight, 0–1439. */
  start: number;
  /** Closing time, minutes after midnight, 0–1439. Before `start` = after midnight. */
  end: number;
}

/** No hours set: the business day is the calendar day, as before this existed. */
export const CALENDAR_DAY: BusinessHours = { start: 0, end: 0 };

const MINUTE_MS = 60_000;

/** Whether two settings are the same hours. */
export function sameHours(a: BusinessHours, b: BusinessHours): boolean {
  return a.start === b.start && a.end === b.end;
}

/** The minute of day at which one business day hands over to the next. */
export function cutoffMinute(hours: BusinessHours): number {
  const { start, end } = hours;
  if (start === end) return start;
  // Length of the closed stretch, from closing round to the next opening.
  const closed = (start - end + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return (end + Math.floor(closed / 2)) % MINUTES_PER_DAY;
}

/**
 * Whether the business day opening on date D starts at the cut-off on D
 * (false) or on D−1 (true). It is D−1 only when the cut-off falls later in the
 * clock than the opening — a venue opening at 02:00 whose quiet hours are the
 * evening before.
 */
function startsDayBefore(hours: BusinessHours): boolean {
  return cutoffMinute(hours) > hours.start;
}

/** `YYYY-MM-DD` of a zoned calendar reading. */
function keyOf(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A date key moved by whole days. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return keyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The business date, as `YYYY-MM-DD`, that an instant belongs to. */
export function businessDateKey(instant: Date, hours: BusinessHours): string {
  const cutoff = cutoffMinute(hours);
  const p = zonedParts(new Date(instant.getTime() - cutoff * MINUTE_MS));
  const key = keyOf(p.year, p.month, p.day);
  return startsDayBefore(hours) ? shiftDateKey(key, 1) : key;
}

/** The instants a business date covers: `[from, to)`, 24 hours. */
export function businessDayWindow(
  key: string,
  hours: BusinessHours,
): { from: Date; to: Date } {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const midnight = zonedMidnight(y, m, d);
  const offset = cutoffMinute(hours) - (startsDayBefore(hours) ? MINUTES_PER_DAY : 0);
  const from = new Date(midnight.getTime() + offset * MINUTE_MS);
  return { from, to: new Date(from.getTime() + MINUTES_PER_DAY * MINUTE_MS) };
}

/**
 * A date key as the value Prisma writes to a `@db.Date` column: midnight UTC of
 * that date. Postgres keeps only the date part, so no zone is involved.
 */
export function dbDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** The inverse: a `@db.Date` value read back, as `YYYY-MM-DD`. */
export function keyOfDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `"HH:MM"` for a minute of day, as a time input shows it. */
export function minuteToClock(minute: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/**
 * The hours a site actually runs on: its own when set, else — for a branch —
 * its chain's, else the calendar day. Both ends must be set to count.
 */
export function effectiveHours(
  site: { businessDayStart: number | null; businessDayEnd: number | null },
  parent?: { businessDayStart: number | null; businessDayEnd: number | null } | null,
): BusinessHours {
  if (site.businessDayStart !== null && site.businessDayEnd !== null) {
    return { start: site.businessDayStart, end: site.businessDayEnd };
  }
  if (parent && parent.businessDayStart !== null && parent.businessDayEnd !== null) {
    return { start: parent.businessDayStart, end: parent.businessDayEnd };
  }
  return CALENDAR_DAY;
}
