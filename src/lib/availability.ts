import { MINUTES_PER_DAY, type ZonedMoment } from "./time";

/**
 * When a dish is offered, and whether it may be ordered right now.
 *
 * A restaurant does not sell the same menu at 9am and 9pm, and before this
 * existed the only way to express that was for someone to toggle `isAvailable`
 * by hand twice a day, every day. A schedule states the intent once.
 *
 * Free of database, framework and clock imports — the whole module is a
 * function of two small integers — because this single answer is consumed by
 * the public menu, the order path, the dashboard and the design preview, and
 * four copies of "is it open?" that disagree is four different menus. The same
 * discipline `pricing.ts` and `inventory.ts` follow, for the same reason: the
 * part that decides what a customer may buy has to be testable on its own.
 *
 * Time is handled in `src/lib/time.ts`: callers reduce an instant to a
 * {@link ZonedMoment} in the venue's zone and pass it in. Nothing here reads a
 * clock, so a test can state the exact minute it means.
 */

/**
 * One period during which something is offered.
 *
 * Minutes from local midnight rather than a `time` column: opening hours are
 * wall-clock facts with no date attached, integers compare and sort without a
 * timezone in the picture, and "18:00" survives being read back on any host.
 *
 * `endMinute` runs to 1440 — midnight at the *end* of the day — so "18:00 until
 * midnight" is expressible as 1080→1440 and stays a same-day window. Without
 * that, an owner would have to write 23:59 and lose a minute, or write 00:00
 * and get an overnight window that means something else entirely.
 */
export interface ScheduleWindow {
  /** 0 = Sunday … 6 = Saturday, matching {@link ZonedMoment}. */
  dayOfWeek: number;
  /** Minutes from midnight, 0–1439. */
  startMinute: number;
  /** Minutes from midnight, 1–1440. */
  endMinute: number;
}

/** A product or category, as far as scheduling is concerned. */
export interface Schedulable {
  /**
   * The owner's switch. Off keeps the windows in the database but stops them
   * applying, which is what makes "suspend the schedule for Nowruz" possible
   * without deleting a week of setup and typing it again afterwards.
   */
  scheduleEnabled: boolean;
  windows: readonly ScheduleWindow[];
}

/** Why something cannot be ordered, when it cannot. */
export type UnavailableReason =
  /** The owner marked it unavailable, or emptied the shelf. */
  | "manual"
  /** Outside its own opening hours. */
  | "schedule"
  /** Its category is outside *its* opening hours. */
  | "category";

export interface AvailabilityState {
  available: boolean;
  reason: UnavailableReason | null;
}

/**
 * Whether a single window is open at a given moment.
 *
 * The half-open interval `[start, end)` is deliberate: a window ending at 12:00
 * and another starting at 12:00 must hand over cleanly, with the dish belonging
 * to exactly one of them at noon rather than to both or to neither.
 *
 * A window whose end is not after its start runs past midnight — 18:00 → 02:00
 * is the evening of `dayOfWeek` and the small hours of the day after. It is
 * therefore matched in two pieces: the tail of its own day, and the head of the
 * next. Testing `start <= now && now < end` alone silently reports every
 * overnight window as closed for the whole of its second half, which is the
 * half a late-night kitchen actually trades in.
 */
export function windowCovers(window: ScheduleWindow, at: ZonedMoment): boolean {
  const { dayOfWeek, startMinute, endMinute } = window;

  if (endMinute > startMinute) {
    return (
      at.dayOfWeek === dayOfWeek &&
      at.minuteOfDay >= startMinute &&
      at.minuteOfDay < endMinute
    );
  }

  // Runs past midnight. `(day + 1) % 7` is the morning half, so a Saturday
  // 18:00 → 02:00 window is open at 01:00 on Sunday.
  const startsToday = at.dayOfWeek === dayOfWeek && at.minuteOfDay >= startMinute;
  const endsTomorrow = at.dayOfWeek === (dayOfWeek + 1) % 7 && at.minuteOfDay < endMinute;

  return startsToday || endsTomorrow;
}

/**
 * Whether a schedule permits this moment.
 *
 * Two cases answer `true` without looking at the clock, and both exist to keep
 * the feature from changing anything it was not asked to change:
 *
 *   * **No windows** — the overwhelming majority of dishes. An item nobody has
 *     scheduled is governed entirely by the availability rules that predate
 *     this feature, which is what stops a migration from quietly closing every
 *     menu on the platform.
 *   * **Switched off** — the owner has suspended the schedule; the windows stay
 *     on the row, ready to be switched back on.
 *
 * Otherwise any one open window is enough. Overlapping windows therefore union
 * rather than conflict, so 09:00–13:00 alongside 12:00–15:00 simply means open
 * 09:00–15:00 — the interpretation an owner expects, and one that cannot
 * produce a contradiction to resolve.
 */
export function scheduleAllows(schedule: Schedulable, at: ZonedMoment): boolean {
  if (!schedule.scheduleEnabled) return true;
  if (schedule.windows.length === 0) return true;

  return schedule.windows.some((window) => windowCovers(window, at));
}

/**
 * The one answer to "may this dish be ordered right now?".
 *
 * Every consumer asks this — the menu that renders it, the order path that
 * enforces it, the preview that shows the owner what a guest sees. The order of
 * the checks decides which reason is reported, and it runs outermost-first: a
 * dish in a closed category is reported as `category` rather than `schedule`,
 * because "breakfast is over" is the true and useful explanation and the dish's
 * own hours are beside the point.
 *
 * A closed category closes its products even when the product itself is inside
 * its own window. That is the whole meaning of scheduling a category, and
 * enforcing it here — rather than by filtering categories out somewhere — is
 * what stops a product remaining orderable through a crafted request after the
 * category that contains it has closed for the day.
 */
export function resolveAvailability(
  input: {
    /** The existing manual switch. Nothing here overrides it. */
    isAvailable: boolean;
    product: Schedulable;
    /** Absent for a dish read outside any category context. */
    category?: Schedulable;
  },
  at: ZonedMoment,
): AvailabilityState {
  if (!input.isAvailable) return { available: false, reason: "manual" };

  if (input.category && !scheduleAllows(input.category, at)) {
    return { available: false, reason: "category" };
  }

  if (!scheduleAllows(input.product, at)) {
    return { available: false, reason: "schedule" };
  }

  return { available: true, reason: null };
}

// --------------------------- input-side helpers ----------------------------

/**
 * Parses `"HH:MM"` into minutes from midnight.
 *
 * `"24:00"` is accepted as 1440 so an end time of midnight can be written the
 * way it reads. Returns `null` for anything malformed rather than throwing:
 * every caller is validating untrusted input and wants a rejection, not an
 * exception to catch.
 */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;

  const total = hours * 60 + minutes;
  return total <= MINUTES_PER_DAY ? total : null;
}

/** Renders minutes from midnight back as `"HH:MM"`, for the editor. */
export function formatTimeOfDay(minute: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minute)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * The week in the order an Iranian owner reads it.
 *
 * Stored values follow `Date.prototype.getDay` (0 = Sunday) so that converting
 * an instant to a weekday is an identity rather than an arithmetic step that
 * can be got wrong. The Iranian week starting on Saturday is a presentation
 * concern, and lives here as one list rather than as a `+1 % 7` scattered
 * through the UI.
 */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

/**
 * Enough windows for three services a day across a full week, and no more.
 *
 * Not a product rule so much as a bound on what one request may write: the
 * editor cannot produce anything near it, so hitting this means a caller that
 * is not the editor.
 */
export const MAX_SCHEDULE_WINDOWS = 30;
