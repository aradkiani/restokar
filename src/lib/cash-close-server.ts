import "server-only";
import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import { formatMoney } from "./format";
import { dbDate } from "./business-day";
import { dayKey, summariseDay, type DaySummary } from "./cash-close";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "./auth/session";

/**
 * The business day's figures for one site, from the orders filed under that
 * business date — including the ones placed after midnight in a late venue.
 */
export async function daySummary(siteId: string, start: Date): Promise<DaySummary> {
  const orders = await prisma.order.findMany({
    where: { restaurantId: siteId, businessDate: dbDate(dayKey(start)) },
    select: {
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      total: true,
      discount: true,
      tip: true,
      tax: true,
      serviceCharge: true,
      refundedAt: true,
    },
  });
  return summariseDay(orders);
}

export interface CloseRecord {
  day: string;
  /** The float in the drawer when the day opened. */
  openingCash: number;
  /** Opening float plus the cash taken: what the drawer should hold. */
  expectedCash: number;
  countedCash: number;
  difference: number;
  note: string | null;
  closedByLabel: string;
  closedAt: string;
  summary: DaySummary;
}

function toRecord(row: {
  day: Date;
  openingCash: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  note: string | null;
  closedByLabel: string;
  closedAt: Date;
  summary: Prisma.JsonValue;
}): CloseRecord {
  return {
    day: dayKey(row.day),
    openingCash: row.openingCash,
    expectedCash: row.expectedCash,
    countedCash: row.countedCash,
    difference: row.difference,
    note: row.note,
    closedByLabel: row.closedByLabel,
    closedAt: row.closedAt.toISOString(),
    summary: row.summary as unknown as DaySummary,
  };
}

const closeSelect = {
  day: true,
  openingCash: true,
  expectedCash: true,
  countedCash: true,
  difference: true,
  note: true,
  closedByLabel: true,
  closedAt: true,
  summary: true,
} as const;

export async function getClose(siteId: string, start: Date): Promise<CloseRecord | null> {
  const row = await prisma.dailyClose.findUnique({
    where: { restaurantId_day: { restaurantId: siteId, day: start } },
    select: closeSelect,
  });
  return row ? toRecord(row) : null;
}

export async function recentCloses(siteId: string, take = 30): Promise<CloseRecord[]> {
  const rows = await prisma.dailyClose.findMany({
    where: { restaurantId: siteId },
    orderBy: { day: "desc" },
    take,
    select: closeSelect,
  });
  return rows.map(toRecord);
}

/**
 * Records the close: the figures are recomputed here from the orders, never
 * taken from the request, so the only thing a cashier states is what they
 * counted. Closing a day again replaces the record; the audit log keeps the
 * earlier count.
 */
export async function closeDay(args: {
  siteId: string;
  start: Date;
  openingCash: number;
  countedCash: number;
  note: string | null;
  user: SessionUser;
  ip: string | null;
}): Promise<CloseRecord> {
  const summary = await daySummary(args.siteId, args.start);
  // The drawer should hold the opening float plus every cash payment taken.
  const expectedCash = args.openingCash + summary.expectedCash;
  const difference = args.countedCash - expectedCash;
  const data = {
    summary: summary as unknown as Prisma.InputJsonValue,
    openingCash: args.openingCash,
    expectedCash,
    countedCash: args.countedCash,
    difference,
    note: args.note,
    closedById: args.user.id,
    closedByLabel: args.user.phone ?? args.user.name,
    closedAt: new Date(),
  };
  const row = await prisma.dailyClose.upsert({
    where: { restaurantId_day: { restaurantId: args.siteId, day: args.start } },
    create: { restaurantId: args.siteId, day: args.start, ...data },
    update: data,
    select: closeSelect,
  });

  const sign = difference === 0 ? "" : difference > 0 ? " (اضافه)" : " (کسری)";
  await recordAudit({
    actor: args.user,
    restaurantId: args.siteId,
    action: "DAY_CLOSED",
    summary: `بستن صندوق ${dayKey(args.start)}: شمارش ${formatMoney(args.countedCash)}، انتظار ${formatMoney(expectedCash)}، اختلاف ${formatMoney(Math.abs(difference))} تومان${sign}`,
    entityType: "DailyClose",
    entityId: dayKey(args.start),
    metadata: {
      openingCash: args.openingCash,
      expectedCash,
      countedCash: args.countedCash,
      difference,
    },
    ip: args.ip,
  });
  return toRecord(row);
}
