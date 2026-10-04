import "server-only";
import { prisma } from "./prisma";
import { menuOwnerId } from "./menu";
import { normalisePhone } from "./phone";
import { getCustomer, type CustomerDetail } from "./customers-server";

/**
 * Everything the dashboard shows about one order, and who placed it.
 *
 * Separate from `kitchen-board.ts` on purpose. The board is polled every thirty
 * seconds by every screen on the pass, so it carries the minimum that fits on a
 * card; this is fetched once, when somebody opens an order, and can afford the
 * options, the per-line money and the guest's history.
 *
 * `costSnapshot` is still never selected. It is the venue's own margin, it has
 * no place on a screen used by floor staff, and the board's own comment already
 * makes that call for the same reason.
 */

export interface OrderDetail {
  id: string;
  orderNumber: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;

  tableNumber: string | null;
  serviceType: "DINE_IN" | "TAKEAWAY";
  customerName: string;
  customerPhone: string | null;
  note: string | null;
  /** Written by staff rather than scanned by a guest. */
  isManual: boolean;

  subtotal: number;
  discount: number;
  discountCode: string | null;
  serviceCharge: number;
  tax: number;
  tip: number;
  roundingAdjustment: number;
  total: number;

  placedAt: string;
  preparingAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;

  items: {
    id: string;
    name: string;
    quantity: number;
    note: string | null;
    /** Per-unit price as charged, before options. */
    unitPrice: number;
    /** What this line came to, options included. */
    lineTotal: number;
    options: { id: string; name: string; priceDelta: number }[];
  }[];

  payments: {
    id: string;
    status: string;
    amount: number;
    refId: string | null;
    cardPan: string | null;
    createdAt: string;
    verifiedAt: string | null;
    failureReason: string | null;
  }[];

  /**
   * The guest's record, when one matches.
   *
   * Null is an ordinary outcome, not an error: ordering has never required a
   * phone number, so a walk-in who gave only a name has no customer record and
   * never will. The UI says so rather than showing an empty profile.
   */
  customer: CustomerDetail | null;
  /** Why there is no customer, so the UI can say something useful. */
  customerMissingReason: "noPhone" | "notFound" | null;
}

/**
 * Finds the customer an order belongs to.
 *
 * Two routes to the same person, in order of trust:
 *
 *  1. `customerId`, written by `linkCustomer` when the order was placed. This
 *     is the authoritative link.
 *  2. The phone number snapshotted on the order. `customerId` is `SetNull`, so
 *     an order whose customer record was later removed still knows the number
 *     it was placed with — and an order predating customer linking has no id at
 *     all. Normalised through `phone.ts`, which is what makes «۰۹۱۲…» and
 *     `0912 …` the same person.
 *
 * Scoped to the **menu owner**, not the serving venue: a chain's guests belong
 * to the chain, so a branch order's customer lives under the parent. Looking it
 * up against the branch would return null for every chain order.
 */
async function resolveCustomer(
  venue: { id: string; parentRestaurantId: string | null },
  order: { customerId: string | null; customerPhone: string | null },
): Promise<{
  customer: CustomerDetail | null;
  reason: OrderDetail["customerMissingReason"];
}> {
  const ownerId = menuOwnerId(venue);

  if (order.customerId) {
    const customer = await getCustomer(ownerId, order.customerId);
    if (customer) return { customer, reason: null };
  }

  const phone = normalisePhone(order.customerPhone);
  if (!phone) return { customer: null, reason: "noPhone" };

  const match = await prisma.customer.findFirst({
    where: { restaurantId: ownerId, phone },
    select: { id: true },
  });

  if (!match) return { customer: null, reason: "notFound" };

  const customer = await getCustomer(ownerId, match.id);
  return { customer, reason: customer ? null : "notFound" };
}

/**
 * One order, in full.
 *
 * Returns null rather than throwing when the id belongs to another venue — the
 * caller turns that into a 404, so a guessed id is indistinguishable from one
 * that does not exist.
 */
export async function getOrderDetail(
  restaurantId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      tableNumber: true,
      serviceType: true,
      customerName: true,
      customerPhone: true,
      customerId: true,
      note: true,
      isManual: true,
      subtotal: true,
      discount: true,
      discountCode: true,
      serviceCharge: true,
      tax: true,
      tip: true,
      roundingAdjustment: true,
      total: true,
      placedAt: true,
      preparingAt: true,
      readyAt: true,
      deliveredAt: true,
      paidAt: true,
      canceledAt: true,
      refundedAt: true,
      items: {
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          note: true,
          priceSnapshot: true,
          options: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              groupNameSnapshot: true,
              choiceNameSnapshot: true,
              priceDeltaSnapshot: true,
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          amount: true,
          refId: true,
          cardPan: true,
          createdAt: true,
          verifiedAt: true,
          failureReason: true,
        },
      },
    },
  });

  if (!order) return null;

  const venue = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { id: true, parentRestaurantId: true },
  });

  const { customer, reason } = await resolveCustomer(venue, order);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    tableNumber: order.tableNumber,
    serviceType: order.serviceType,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    note: order.note,
    isManual: order.isManual,
    subtotal: order.subtotal,
    discount: order.discount,
    discountCode: order.discountCode,
    serviceCharge: order.serviceCharge,
    tax: order.tax,
    tip: order.tip,
    roundingAdjustment: order.roundingAdjustment,
    total: order.total,
    placedAt: order.placedAt.toISOString(),
    preparingAt: order.preparingAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    canceledAt: order.canceledAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      note: item.note,
      unitPrice: item.priceSnapshot,
      /*
        `priceSnapshot` already includes the option deltas — the schema says so
        on `OrderItemOption.priceDeltaSnapshot`, which exists only so a receipt
        can explain *why* a burger cost 30,000 more. Adding them again here
        would overstate every line that carried an option, and the detail view
        would disagree with the total printed directly beneath it.
      */
      lineTotal: item.priceSnapshot * item.quantity,
      options: item.options.map((option) => ({
        id: option.id,
        name: `${option.groupNameSnapshot}: ${option.choiceNameSnapshot}`,
        priceDelta: option.priceDeltaSnapshot,
      })),
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      status: p.status,
      amount: p.amount,
      refId: p.refId,
      cardPan: p.cardPan,
      createdAt: p.createdAt.toISOString(),
      verifiedAt: p.verifiedAt?.toISOString() ?? null,
      failureReason: p.failureReason,
    })),
    customer,
    customerMissingReason: reason,
  };
}
