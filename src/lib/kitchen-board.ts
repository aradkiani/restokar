import "server-only";
import { finishedVisibleSince } from "./order-retirement";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * The one definition of what the kitchen board shows and in what shape.
 *
 * The board is fed from two places — the server-rendered page and the polling
 * refresh route — and they had already drifted once: the route returned raw
 * rows carrying `nameSnapshot` while the board read `item.name`, so the first
 * refresh after any status change replaced every line item with a bare "۲×".
 * The same drift would now decide whether a refund the venue owes appears at
 * all, which is a worse thing to get wrong than a line label.
 */

const ACTIVE: OrderStatus[] = ["RECEIVED", "PREPARING", "READY"];

/**
 * Which orders belong on the board.
 *
 * Cancelled orders are normally gone the moment they are cancelled — that is
 * the point of cancelling. The exception is one the customer had already paid
 * for: the venue is holding money it does not own, and an order that vanishes
 * takes the evidence of that with it. Those stay until the owner confirms the
 * refund.
 */
export function boardWhere(restaurantId: string) {
  return {
    restaurantId,
    OR: [
      { status: { in: ACTIVE } },
      {
        status: "DELIVERED" as OrderStatus,
        /*
          A delivered order stays until it has been paid for an hour.

          `max(deliveredAt, paidAt) >= cutoff` is what the rule says, and
          `a >= cutoff OR b >= cutoff` is the same question in the form Prisma
          can express — `order-retirement.test.ts` pins that equivalence.

          The unpaid branch comes first and has no time bound at all: an order
          handed over and never settled must never leave the pass, which the
          previous rule got wrong by measuring from delivery alone.
        */
        OR: [
          { paymentStatus: { not: "PAID" as const } },
          { deliveredAt: { gte: finishedVisibleSince() } },
          { paidAt: { gte: finishedVisibleSince() } },
        ],
      },
      {
        status: "CANCELED" as OrderStatus,
        paymentStatus: "PAID" as const,
        refundedAt: null,
      },
    ],
  };
}

/** Everything the board needs, and deliberately nothing else. */
export const boardInclude = { items: true } as const;

interface BoardRow {
  id: string;
  orderNumber: number;
  tableNumber: string | null;
  serviceType: string;
  customerName: string;
  note: string | null;
  // The enum rather than `string`, so the board's own narrower Status union
  // accepts this without a cast at the call site.
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  tip: number;
  total: number;
  placedAt: Date;
  deliveredAt: Date | null;
  /** Needed on the client so its live re-filter applies the same rule. */
  paidAt: Date | null;
  canceledAt: Date | null;
  refundedAt: Date | null;
  items: { id: string; nameSnapshot: string; quantity: number; note: string | null }[];
}

/**
 * Maps a row to the board's DTO.
 *
 * `costSnapshot` is the venue's own cost price and is never selected into this
 * shape — the board has no use for it and it would otherwise be shipped to
 * every browser on the pass.
 */
export function toBoardOrder(order: BoardRow) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    tableNumber: order.tableNumber,
    takeaway: order.serviceType === "TAKEAWAY",
    customerName: order.customerName,
    note: order.note,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    tip: order.tip,
    total: order.total,
    placedAt: order.placedAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    canceledAt: order.canceledAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      note: item.note,
    })),
  };
}
