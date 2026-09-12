import type { DateRange } from "./analytics";
import { jalaliMonthStartInZone } from "./jalali";
import { endOfDayInZone, startOfDayInZone, zonedMoment } from "./time";

/**
 * What a sales figure gets compared against.
 *
 * Every window here is anchored to `APP_TIME_ZONE` through `time.ts` — there is
 * no second timezone implementation, and nothing reads the host's clock.
 *
 * One rule shapes all of it: **the two windows must cover the same amount of
 * trading time.** A part-traded period measured against a whole one reports a
 * collapse every morning and a boom every evening, which is worse than no
 * insight at all. Two ways of honouring that, depending on the period:
 *
 *   * **Finished windows** (`yesterday`, `last7`, `last30`, `last90`) end at
 *     the close of yesterday. Today is deliberately excluded — a rolling window
 *     ending "now" always holds one part-traded day.
 *   * **Running windows** (`today`, `thisWeek`, `thisMonth`) are what an owner
 *     actually wants to watch, so they are kept — and the *previous* window is
 *     cut to the same elapsed slice rather than taken whole. They carry
 *     `incomplete: true` so the dashboard can say so.
 *
 * Day-of-week matters more than day-of-month in this trade: Thursday is busy
 * and Monday is not, so `today` and `yesterday` compare against the same
 * weekday a week earlier rather than against the day before. That is the rule
 * the overview's existing comparison already uses.
 */

export const COMPARISON_PRESETS = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "last7",
  "last30",
  "last90",
] as const;

export type ComparisonPreset = (typeof COMPARISON_PRESETS)[number];

export function isComparisonPreset(value: string): value is ComparisonPreset {
  return (COMPARISON_PRESETS as readonly string[]).includes(value);
}

export interface ComparisonWindows {
  preset: ComparisonPreset;
  current: DateRange;
  previous: DateRange;
  /** The current window is still being traded. */
  incomplete: boolean;
  /** Whole days the current window spans, for per-day figures. */
  days: number;
}

const DAY_MS = 86_400_000;

/**
 * Midnight on the Saturday that opens the week containing `instant`.
 *
 * Saturday because that is where the Iranian week starts. `zonedMoment` reports
 * the weekday in the venue's zone — 0 = Sunday … 6 = Saturday — so the distance
 * back to Saturday is `(dayOfWeek + 1) % 7`.
 */
export function startOfWeekInZone(instant: Date): Date {
  const { dayOfWeek } = zonedMoment(instant);
  return startOfDayInZone(instant, -((dayOfWeek + 1) % 7));
}

/** Whole days a window spans, rounded up so a part day still counts as one. */
function daysIn(range: DateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS));
}

/**
 * A finished block of `days` whole days ending at the close of yesterday, and
 * the equally long block immediately before it.
 */
function rollingWindows(now: Date, days: number): ComparisonWindows {
  const lastFinishedDay = startOfDayInZone(now, -1);

  return {
    preset: days === 7 ? "last7" : days === 30 ? "last30" : "last90",
    current: {
      from: startOfDayInZone(now, -days),
      to: endOfDayInZone(lastFinishedDay),
    },
    previous: {
      from: startOfDayInZone(now, -(days * 2)),
      to: endOfDayInZone(startOfDayInZone(now, -(days + 1))),
    },
    incomplete: false,
    days,
  };
}

/** The same elapsed slice, one week earlier to the millisecond. */
function weekEarlier(range: DateRange): DateRange {
  return {
    from: new Date(range.from.getTime() - 7 * DAY_MS),
    to: new Date(range.to.getTime() - 7 * DAY_MS),
  };
}

export function resolveComparison(
  preset: ComparisonPreset,
  now: Date = new Date(),
): ComparisonWindows {
  if (preset === "last7") return rollingWindows(now, 7);
  if (preset === "last30") return rollingWindows(now, 30);
  if (preset === "last90") return rollingWindows(now, 90);

  if (preset === "today") {
    const current = { from: startOfDayInZone(now), to: now };
    return {
      preset,
      current,
      previous: weekEarlier(current),
      incomplete: true,
      days: 1,
    };
  }

  if (preset === "yesterday") {
    const start = startOfDayInZone(now, -1);
    const current = { from: start, to: endOfDayInZone(start) };
    return {
      preset,
      current,
      previous: weekEarlier(current),
      incomplete: false,
      days: 1,
    };
  }

  if (preset === "thisWeek") {
    const current = { from: startOfWeekInZone(now), to: now };
    return {
      preset,
      current,
      previous: weekEarlier(current),
      incomplete: true,
      days: daysIn(current),
    };
  }

  return thisMonthWindows(now);
}

/**
 * The Jalali month so far, against the same number of days of the month before.
 *
 * Jalali months are 31, 30 or 29 days, so "the same elapsed slice" can be
 * longer than the whole of the previous month. Both windows are therefore cut
 * to whichever is shorter: comparing 31 days of Shahrivar against 29 of Esfand
 * would show growth that is entirely an artefact of the calendar. The cost is
 * that on the 31st of a long month the last day or two is held back until the
 * comparison can be made fairly, which is the honest trade.
 */
function thisMonthWindows(now: Date): ComparisonWindows {
  const monthStart = jalaliMonthStartInZone(now);

  // The last millisecond of the previous month is one before this one opens.
  const previousMonthEnd = new Date(monthStart.getTime() - 1);
  const previousMonthStart = jalaliMonthStartInZone(previousMonthEnd);

  const elapsed = now.getTime() - monthStart.getTime();
  const previousMonthLength = previousMonthEnd.getTime() - previousMonthStart.getTime();
  const span = Math.min(elapsed, previousMonthLength);

  const current = { from: monthStart, to: new Date(monthStart.getTime() + span) };

  return {
    preset: "thisMonth",
    current,
    previous: {
      from: previousMonthStart,
      to: new Date(previousMonthStart.getTime() + span),
    },
    incomplete: true,
    days: daysIn(current),
  };
}
