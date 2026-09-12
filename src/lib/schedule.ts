import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ScheduleWindowInput } from "./validation";

/**
 * Writing opening hours, in one place.
 *
 * Four routes save a schedule — creating and updating a product, creating and
 * updating a category — and all four have to set `restaurantId` from the
 * session onto every row. A window written without it, or with one copied from
 * the request, would be a row outside the tenant boundary that every other
 * query in this codebase relies on. One function means one chance to get that
 * wrong rather than four.
 *
 * The evaluation half of the feature lives in `availability.ts`, which is pure;
 * this is only the persistence half.
 */

/** Which parent a set of windows belongs to. Exactly one, matching the CHECK. */
export type ScheduleTarget =
  { kind: "product"; productId: string } | { kind: "category"; categoryId: string };

/**
 * Replaces a target's windows wholesale.
 *
 * The same approach `infoSections` and `optionGroups` already take: the editor
 * always submits the complete set, so diffing would add work and a class of
 * bug — a half-applied schedule — for no benefit. Recreating the rows is
 * harmless because nothing references a window by id; the order path reads
 * windows to make a decision and never stores a pointer to one.
 *
 * Runs inside the caller's transaction so a product update and its schedule
 * either both land or neither does. A product whose price saved but whose
 * hours did not would be on sale at the wrong time.
 */
export async function replaceSchedule(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  target: ScheduleTarget,
  windows: readonly ScheduleWindowInput[],
): Promise<void> {
  const where =
    target.kind === "product"
      ? { productId: target.productId }
      : { categoryId: target.categoryId };

  await tx.availabilityWindow.deleteMany({ where });

  if (windows.length === 0) return;

  await tx.availabilityWindow.createMany({
    data: windows.map((window) => ({
      // From the session, never from the request body — the rule the whole
      // tenancy model rests on.
      restaurantId,
      ...where,
      dayOfWeek: window.dayOfWeek,
      startMinute: window.start,
      endMinute: window.end,
    })),
  });
}

/** Shape the editor round-trips: minutes back out as the `"HH:MM"` it sent. */
export const scheduleSelect = {
  id: true,
  dayOfWeek: true,
  startMinute: true,
  endMinute: true,
} as const;

/** Windows in the order the editor lists them: by day, then by start time. */
export const scheduleOrderBy = [
  { dayOfWeek: "asc" },
  { startMinute: "asc" },
] satisfies Prisma.AvailabilityWindowOrderByWithRelationInput[];

/** The parts of a window that decide behaviour, ignoring ids and timestamps. */
interface ComparableWindow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Whether a saved schedule differs from the one being submitted.
 *
 * The editor posts the full set on every save, so most saves resubmit an
 * identical schedule while the owner was really changing a price. Auditing
 * those would bury the changes that matter under entries that record nothing —
 * the failure mode the audit log's own documentation warns against.
 *
 * Compared on a canonical string of the fields that decide behaviour: the rows
 * are recreated with new ids each time, so ids would report every save as a
 * change, and order is normalised because the two sides arrive sorted
 * differently.
 */
export function scheduleDiffers(
  before: readonly ComparableWindow[],
  after: readonly ComparableWindow[],
): boolean {
  const canonical = (windows: readonly ComparableWindow[]) =>
    windows
      .map((w) => `${w.dayOfWeek}:${w.startMinute}-${w.endMinute}`)
      .sort()
      .join("|");

  return canonical(before) !== canonical(after);
}
