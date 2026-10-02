/**
 * Which way an order may move through the kitchen.
 *
 * Pure: imported by the kitchen board (to draw its buttons) and by
 * `updateOrderStatus` (to refuse anything else), so the screen and the server
 * cannot disagree.
 *
 * Forward one step at a time, or cancelled before it reaches the guest. Nothing
 * comes back from CANCELED or DELIVERED. The server used to accept any status
 * from any status, which let a cancelled order be "revived" through the API:
 * it counted as a sale again, while the stock its cancellation had returned
 * was never taken a second time.
 */

export const ORDER_STATUSES = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELED",
] as const;

export type OrderFlowStatus = (typeof ORDER_STATUSES)[number];

/** The one forward move from each status that has one. */
export const NEXT_STATUS: Partial<Record<OrderFlowStatus, OrderFlowStatus>> = {
  RECEIVED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
};

/** Statuses an order may still be cancelled from: anything not yet served. */
export const CANCELLABLE: readonly OrderFlowStatus[] = ["RECEIVED", "PREPARING", "READY"];

export function canMoveOrder(from: string, to: string): boolean {
  if (NEXT_STATUS[from as OrderFlowStatus] === to) return true;
  if (to === "CANCELED") return CANCELLABLE.includes(from as OrderFlowStatus);
  return false;
}
