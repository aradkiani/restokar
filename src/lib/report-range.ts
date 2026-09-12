import type { DateRange } from "./analytics";
import { jalaliMonthRange, jalaliQuarterRange, toJalali } from "./jalali";
import { zonedMidnight } from "./time";
import { monthRange, quarterRange, type ReportPreset } from "./reports";
import type { ReportQuery } from "./validation";

/** Longest window a single report may cover. */
export const MAX_REPORT_DAYS = 400;

export interface ResolvedReportWindow {
  range: DateRange;
  preset: ReportPreset;
}

/**
 * Turns validated query parameters into a concrete window.
 *
 * Shared by the JSON preview endpoint and the printable report page so the two
 * can never interpret the same query differently — a mismatch there would show
 * an owner one set of numbers and hand them a document containing another.
 */
export function resolveReportWindow(query: ReportQuery): ResolvedReportWindow {
  const now = new Date();

  if (query.preset === "custom" && query.from && query.to) {
    return {
      preset: "custom",
      range: {
        // Parsed as local midnight: a venue's reporting day is its own calendar
        // day, and `new Date("2026-03-01")` would be UTC and can shift a day.
        from: parseLocalDate(query.from),
        to: parseLocalDate(query.to),
      },
    };
  }

  // A Jalali month is not a Gregorian one — Mordad 1405 runs 23 July to 22
  // August — so the anchor is interpreted in the calendar the caller named and
  // only then flattened to the Gregorian window every query downstream expects.
  if (query.calendar === "jalali") {
    const jalaliNow = toJalali(now);
    const year = query.year ?? jalaliNow.jy;
    const month = query.month ?? jalaliNow.jm;

    return {
      preset: query.preset,
      range:
        query.preset === "quarter"
          ? jalaliQuarterRange(year, month)
          : jalaliMonthRange(year, month),
    };
  }

  const year = query.year ?? now.getFullYear();
  const month = query.month ?? now.getMonth() + 1;

  return {
    preset: query.preset,
    range:
      query.preset === "quarter" ? quarterRange(year, month) : monthRange(year, month),
  };
}

/**
 * A `YYYY-MM-DD` the owner picked, read as midnight in the *venue's* zone.
 *
 * `new Date("2026-03-01")` is UTC midnight and can land on 28 February; the
 * host's own calendar is no better, because these boundaries are then
 * re-anchored by `resolveRange` and a server left at UTC would shift the window
 * by a day at both ends.
 */
function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return zonedMidnight(year!, month!, day!);
}

/** Guards against a range so wide it would scan the whole order history. */
export function isWindowTooWide({ from, to }: DateRange): boolean {
  return (to.getTime() - from.getTime()) / 86_400_000 > MAX_REPORT_DAYS;
}
