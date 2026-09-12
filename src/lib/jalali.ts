/**
 * Jalali (Persian / Shamsi) calendar helpers.
 *
 * Conversion is delegated to ICU through `Intl` rather than hand-rolled
 * leap-year arithmetic. The runtime already ships an authoritative Persian
 * calendar, and a bespoke implementation would be one more thing to keep
 * correct across the 33-year leap cycle — a wrong leap year silently shifts a
 * whole month of an owner's revenue into the neighbouring report.
 *
 * Isomorphic on purpose: the report period picker is a client component, so
 * nothing here may reach for `server-only` code.
 */

import { APP_TIME_ZONE, startOfDayInZone } from "./time";

const JALALI_PARTS = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/**
 * The same conversion, read in the venue's zone rather than the host's.
 *
 * Separate from `JALALI_PARTS` rather than replacing it: the report period
 * picker and the month-name list are built from local dates the *user* chose,
 * and changing what those mean would move existing reports. This one exists for
 * callers that start from an instant — where the host's zone is never the right
 * answer, because a UTC server reads 01:00 Tehran as the previous day and would
 * put the first hours of every Jalali month in the one before it.
 */
const JALALI_PARTS_IN_ZONE = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

function readParts(formatter: Intl.DateTimeFormat, date: Date): JalaliDate {
  const parts = formatter.formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { jy: read("year"), jm: read("month"), jd: read("day") };
}

/** Jalali year/month/day for a Gregorian date, read in local time. */
export function toJalali(date: Date): JalaliDate {
  return readParts(JALALI_PARTS, date);
}

/** Jalali year/month/day for an instant, read in {@link APP_TIME_ZONE}. */
export function toJalaliInZone(instant: Date): JalaliDate {
  return readParts(JALALI_PARTS_IN_ZONE, instant);
}

/**
 * Midnight in the venue's zone on the 1st of the Jalali month containing
 * `instant`.
 *
 * Walks back a day at a time until ICU says the day-of-month is 1, rather than
 * computing the boundary. A Jalali month is at most 31 days, so the loop is
 * bounded and cheap — and it keeps every leap-year question inside ICU, which
 * is the same reasoning `jalaliMonthStart` already follows.
 */
export function jalaliMonthStartInZone(instant: Date): Date {
  let day = startOfDayInZone(instant);

  for (let guard = 0; guard < 32; guard++) {
    if (toJalaliInZone(day).jd === 1) return day;
    day = startOfDayInZone(day, -1);
  }

  return day;
}

/** The current Jalali year — the anchor for the report year dropdown. */
export function currentJalaliYear(): number {
  return toJalali(new Date()).jy;
}

/**
 * Local midnight on the 1st of a Jalali month, as a Gregorian `Date`.
 *
 * Farvardin 1 lands on 20–21 March, and months 1–6 have 31 days while 7–11
 * have 30, so the initial guess is never more than a couple of days out. The
 * loop then walks onto the correct month and steps straight to its 1st, which
 * keeps the leap-year question entirely inside ICU.
 */
export function jalaliMonthStart(jy: number, jm: number): Date {
  const dayOfYear = jm <= 7 ? (jm - 1) * 31 : 186 + (jm - 7) * 30;
  const date = new Date(jy + 621, 2, 21, 0, 0, 0, 0);
  date.setDate(date.getDate() + dayOfYear);

  for (let guard = 0; guard < 12; guard++) {
    const current = toJalali(date);
    const monthsOff = (current.jy - jy) * 12 + (current.jm - jm);
    if (monthsOff === 0) {
      date.setDate(date.getDate() - (current.jd - 1));
      date.setHours(0, 0, 0, 0);
      return date;
    }
    date.setDate(date.getDate() - monthsOff * 30);
  }

  return date;
}

export interface GregorianWindow {
  from: Date;
  to: Date;
}

/**
 * The first instant of a Jalali month, in the venue's zone.
 *
 * `jalaliMonthStart` walks the *host's* calendar, so on a server in another
 * zone it can name the day either side of the true boundary. Stepping ten days
 * in lands safely inside the target month whichever way it erred, and
 * `jalaliMonthStartInZone` then snaps back to that month's real first day as
 * the venue reckons it.
 *
 * This matters because these windows feed `resolveRange`, which anchors to the
 * venue's day: built on the host's calendar, a Jalali month report on a UTC
 * server ran a day long at both ends.
 */
function jalaliMonthStartZoned(jy: number, jm: number): Date {
  const inside = new Date(jalaliMonthStart(jy, jm).getTime() + 10 * 86_400_000);
  return jalaliMonthStartInZone(inside);
}

/** One Jalali month, expressed as the Gregorian window it covers. */
export function jalaliMonthRange(jy: number, jm: number): GregorianWindow {
  const nextYear = jm === 12 ? jy + 1 : jy;
  const nextMonth = jm === 12 ? 1 : jm + 1;

  return {
    from: jalaliMonthStartZoned(jy, jm),
    // The instant before the next month opens, so a 29-, 30- or 31-day month
    // needs no special case and no leap-year arithmetic.
    to: new Date(jalaliMonthStartZoned(nextYear, nextMonth).getTime() - 1),
  };
}

/** Three Jalali months ending with `jm`, mirroring the Gregorian quarter rule. */
/**
 * Three whole Jalali months *beginning* with the one given.
 *
 * Matches the Gregorian `quarterRange`: the picker asks for a starting month,
 * so Farvardin reports Farvardin–Khordad. Jalali quarters line up with the
 * Iranian fiscal quarters exactly when counted this way from months 1, 4, 7
 * and 10.
 */
export function jalaliQuarterRange(jy: number, jm: number): GregorianWindow {
  let endYear = jy;
  let endMonth = jm + 2;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }

  return {
    from: jalaliMonthStartZoned(jy, jm),
    to: jalaliMonthRange(endYear, endMonth).to,
  };
}

/**
 * The twelve Jalali month names, indexed 0–11 for months 1–12.
 *
 * Each name is formatted from a date that genuinely falls inside that month.
 * Formatting `new Date(2024, i, 1)` instead — a Gregorian month index run
 * through a Persian formatter — is what previously paired "دی" with month 1.
 */
export function jalaliMonthNames(jy: number = currentJalaliYear()): string[] {
  const formatter = new Intl.DateTimeFormat("fa-IR", {
    month: "long",
    timeZone: APP_TIME_ZONE,
  });
  return Array.from({ length: 12 }, (_, index) =>
    formatter.format(jalaliMonthStartZoned(jy, index + 1)),
  );
}
