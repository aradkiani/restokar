import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import {
  businessDateKey,
  businessDayWindow,
  effectiveHours,
  type BusinessHours,
} from "./business-day";
import { endOfDayInZone, startOfDayInZone, zonedMidnight } from "./time";

/**
 * A site's business-day hours, read once per request: its own, its chain's
 * when it is a branch without hours, or the calendar day.
 */
export const getSiteHours = cache(async (siteId: string): Promise<BusinessHours> => {
  const site = await prisma.restaurant.findUnique({
    where: { id: siteId },
    select: {
      businessDayStart: true,
      businessDayEnd: true,
      parentRestaurant: { select: { businessDayStart: true, businessDayEnd: true } },
    },
  });
  if (!site) return effectiveHours({ businessDayStart: null, businessDayEnd: null });
  return effectiveHours(site, site.parentRestaurant);
});

/** The business date running at a site right now, as `YYYY-MM-DD`. */
export async function businessTodayKey(
  siteId: string,
  now = new Date(),
): Promise<string> {
  return businessDateKey(now, await getSiteHours(siteId));
}

/**
 * The site's current business date as the zone-midnight instant every report
 * window is built from (see `resolveRange` in analytics.ts).
 */
export async function businessTodayStart(
  siteId: string,
  now = new Date(),
): Promise<Date> {
  const [y, m, d] = (await businessTodayKey(siteId, now)).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return zonedMidnight(y, m, d);
}

/**
 * An instant on the site's current business date, for code that reasons in
 * calendar days ("today", "this week", "this month"): `now` itself, or — in
 * the small hours, while the previous evening's business day is still running
 * — the last moment of that previous calendar date.
 */
export async function businessNow(siteId: string, now = new Date()): Promise<Date> {
  const start = await businessTodayStart(siteId, now);
  const calendarToday = startOfDayInZone(now);
  if (start.getTime() === calendarToday.getTime()) return now;
  return endOfDayInZone(start);
}

/** When the business day running now at a site ends. */
export async function businessDayEndsAt(siteId: string, now = new Date()): Promise<Date> {
  const hours = await getSiteHours(siteId);
  return businessDayWindow(businessDateKey(now, hours), hours).to;
}
