/**
 * The calendar day, anchored to a timezone rather than to the host's.
 *
 * Every "today", "this month" and "last 30 days" in the product is a *venue's*
 * trading day, and a restaurant's day is decided by the clock on its wall — not
 * by whatever `TZ` the process happened to inherit. Until now those boundaries
 * came from `Date.prototype.setHours`, which reads the host zone, so the same
 * order fell into different days depending on where the app was deployed. On a
 * developer's machine in Tehran that was invisible; on a VPS running UTC it
 * moves every boundary 3½ hours, which silently files late-evening orders under
 * tomorrow and makes "today's revenue" wrong for the first hours of service.
 *
 * Fixing it by asking operators to set `TZ=Asia/Tehran` on the host works right
 * up until someone forgets, and the failure is silent — the numbers are simply
 * wrong, with nothing to indicate it. Deriving the boundary from an explicit
 * zone makes the correct answer independent of how the process was started.
 *
 * One zone rather than a per-venue column: every customer is in Iran, which has
 * a single zone and — since 2022 — no daylight saving. The arithmetic below
 * still handles a DST transition correctly, so the day this becomes a column on
 * Restaurant the only change is where the zone comes from.
 *
 * Isomorphic: no `server-only` marker, because report period pickers are client
 * components and must bound their ranges the same way the server does.
 */

/** The zone every trading day is measured in. */
export const APP_TIME_ZONE = "Asia/Tehran";

/**
 * `h23` rather than `hour12: false` — the latter renders midnight as hour 24
 * under some ICU builds, which would put the start of a day 24 hours after
 * itself.
 */
const ZONE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock reading of an instant in {@link APP_TIME_ZONE}. */
export function zonedParts(instant: Date): ZonedParts {
  const parts = ZONE_PARTS.formatToParts(instant);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * The zone's offset from UTC at a given instant, in milliseconds.
 *
 * Derived by reading the wall clock and re-interpreting it as if it were UTC:
 * the gap between that and the real instant *is* the offset. Seconds are floored
 * off the instant first because the formatter has no millisecond field, and
 * leaving them in would report an offset a fraction of a second out.
 */
function zoneOffsetMs(instant: Date): number {
  const p = zonedParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Midnight in {@link APP_TIME_ZONE}, `deltaDays` calendar days from `date`.
 *
 * Two passes over the offset. The first uses the offset in force at `date` to
 * land near the target; the second re-reads the offset at *that* instant, which
 * is what makes the answer correct when a DST transition falls between the two.
 * With Iran's fixed offset both passes agree, and the second costs one format
 * call — cheap insurance against a zone that does shift.
 *
 * `Date.UTC` normalises day overflow, so a delta that crosses a month or year
 * boundary needs no special handling.
 */
export function startOfDayInZone(date: Date, deltaDays = 0): Date {
  const p = zonedParts(date);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + deltaDays, 0, 0, 0);

  const firstPass = midnightAsUtc - zoneOffsetMs(date);
  return new Date(midnightAsUtc - zoneOffsetMs(new Date(firstPass)));
}

/**
 * The last representable millisecond of the zone's day containing `date`.
 *
 * Computed as "the instant before the next day starts" rather than as start +
 * 24 hours, so a day shortened or lengthened by a DST transition still ends
 * where it actually ends. The 36-hour probe is simply far enough into the next
 * day that no real offset shift can land it back on this one.
 */
export function endOfDayInZone(date: Date): Date {
  const start = startOfDayInZone(date);
  const nextDay = startOfDayInZone(new Date(start.getTime() + 36 * 3_600_000));
  return new Date(nextDay.getTime() - 1);
}

/**
 * A `"YYYY-MM-DDTHH:mm"` wall clock, read as an instant in {@link APP_TIME_ZONE}.
 *
 * What a browser's `datetime-local` input produces has no zone attached, and
 * taking it as the *browser's* local time would mean an owner setting a weekend
 * special from a laptop abroad promoted the dish at the wrong hour in their own
 * restaurant. Interpreting it in the venue's zone is the same rule the weekly
 * opening hours already follow.
 *
 * Two passes over the offset, exactly like `startOfDayInZone`: the first lands
 * near the target, the second re-reads the offset there, which is what keeps
 * the answer right across a daylight-saving transition.
 *
 * Returns `null` for anything malformed — every caller is validating untrusted
 * input and wants a rejection rather than an exception.
 */
export function instantFromZonedWallClock(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = asUtc - zoneOffsetMs(new Date(asUtc));
  const instant = new Date(asUtc - zoneOffsetMs(new Date(firstPass)));

  // `Date.UTC` normalises overflow silently, so 31 February would otherwise
  // become 2 or 3 March rather than being refused.
  const parts = zonedParts(instant);
  if (parts.year !== year || parts.month !== month || parts.day !== day) return null;

  return instant;
}

/**
 * Midnight in {@link APP_TIME_ZONE} on a given calendar date.
 *
 * The primitive every *report* boundary is built from. Report windows used to
 * be assembled with `new Date(year, month - 1, 1)` — the host's calendar — and
 * then re-anchored to the venue's by `resolveRange`. Two calendars in one path:
 * on a server left at UTC a "March" report started on 28 February and ran to
 * 1 April, so a monthly P&L covered 32 days and counted one day twice across
 * two months.
 *
 * Components are expected to name a real date. An overflowing day or month is
 * normalised the way `Date.UTC` does rather than rejected, so callers stepping
 * a month index past December keep working.
 */
export function zonedMidnight(year: number, month: number, day = 1): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const exact = instantFromZonedWallClock(`${year}-${pad(month)}-${pad(day)}T00:00`);
  if (exact) return exact;

  // Midday on the normalised date, so the snap to midnight cannot be pushed
  // onto a neighbouring day by the zone offset.
  return startOfDayInZone(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** The inverse, for filling the editor's input back in. */
export function zonedWallClockOf(instant: Date): string {
  const p = zonedParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes in a day — the unit opening hours are stored in. */
export const MINUTES_PER_DAY = 1440;

/**
 * Where an instant falls in the venue's week: which day, and how far into it.
 *
 * This is the only thing opening-hours arithmetic needs, and reducing an
 * instant to it here means `availability.ts` can stay a pure function of two
 * small numbers — testable without a clock, a zone or a database.
 */
export interface ZonedMoment {
  /** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
  dayOfWeek: number;
  /** Minutes since local midnight, 0–1439. */
  minuteOfDay: number;
}

/**
 * Reads an instant as a weekday and a time of day in {@link APP_TIME_ZONE}.
 *
 * The weekday is derived from the zone's own calendar date rather than from
 * `getDay()` on the original instant: at 01:00 Tehran on a Saturday a UTC host
 * is still on Friday, and taking the weekday from the host is precisely the bug
 * that would make a Saturday schedule fire on the wrong night.
 *
 * `Date.UTC` on the already-zoned year/month/day gives a value whose UTC
 * weekday *is* the zone's weekday, with no locale string parsing in between.
 */
export function zonedMoment(instant: Date = new Date()): ZonedMoment {
  const p = zonedParts(instant);

  return {
    dayOfWeek: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(),
    minuteOfDay: p.hour * 60 + p.minute,
  };
}
