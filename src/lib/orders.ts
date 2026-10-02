import "server-only";
import { z } from "zod";
import { prisma } from "./prisma";
import { HttpError } from "./auth/guards";
import { publishOrderEvent } from "./events";
import { calculatePrice } from "./pricing";
import { discountAmountFor, normaliseCode } from "./discounts";
import { normalisePhone } from "./phone";
import { resolveAvailability, type Schedulable } from "./availability";
import { attributionKey, verifyAttributions } from "./recommendations-server";
import { isFeaturedNow } from "./featured";
import { linkCustomer } from "./customers-server";
import { zonedMoment, type ZonedMoment } from "./time";
import { deductStock, restoreStockForOrder } from "./stock";
import { randomToken } from "./utils";
import { MAX_INT4, ONLINE_PAYMENT_WINDOW_MINUTES } from "./constants";
import { PAYMENTS_ENABLED } from "./features";
import { canMoveOrder } from "./order-flow";
import type { OrderStatus } from "@/generated/prisma/enums";

export const OrderItemInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  note: z.string().max(300).optional(),
  /**
   * Chosen option ids only — never names, and never prices.
   *
   * The client says *which* choices; the server looks up what they cost. This
   * is the same rule that governs product prices, and it matters more here
   * because a price delta is the kind of small number that looks harmless in a
   * request body.
   */
  choiceIds: z.array(z.string().min(1)).max(20).optional(),
  /**
   * The dish whose suggestion put this line in the basket, if any.
   *
   * A claim, not a fact. It is the one field here a guest's browser asserts
   * about *why* something was ordered, and `createOrder` checks it against the
   * venue's actual recommendation edges before crediting anything — an
   * unverifiable claim is dropped and the order proceeds normally. It can
   * therefore never change a price, only whether a sale is counted as an
   * upsell.
   */
  recommendedFrom: z.string().min(1).optional(),
  /**
   * The guest reached this dish through a featured surface.
   *
   * A claim, like `recommendedFrom`, and checked the same way: `createOrder`
   * confirms the dish really is featured and inside its promotion window before
   * believing it. It can never affect the price — only whether the sale is
   * counted as merchandising having worked.
   */
  fromFeatured: z.boolean().optional(),
});

export const CreateOrderInput = z.object({
  slug: z.string().min(1),
  // Guest-facing copy: these messages are read by a customer at a table, so
  // they name what to do rather than restating a schema bound.
  tableNumber: z
    .string()
    .trim()
    .min(1, "شماره میز را وارد کنید")
    .max(20, "شماره میز بیش از حد بلند است"),
  customerName: z
    .string()
    .trim()
    .min(1, "نام خود را وارد کنید")
    .max(60, "نام بیش از حد بلند است"),
  customerPhone: z.string().trim().max(20).optional(),
  note: z.string().trim().max(500, "توضیحات بیش از حد بلند است").optional(),
  paymentMethod: z.enum(["CASH_ON_SITE", "ONLINE"]).default("CASH_ON_SITE"),
  /**
   * Voluntary tip in whole Toman. Bounded here and re-checked against the
   * restaurant's settings in createOrder — a tip is the one figure a guest
   * genuinely chooses, which makes it the one number a caller could otherwise
   * use to write an arbitrary total.
   */
  tip: z.number().int().min(0).max(50_000_000).optional(),
  /**
   * A code the guest typed. Never an amount.
   *
   * The same rule as product prices and option deltas: the client says *which*
   * code, and the server looks up what it is worth. A discount is the one
   * reduction a guest supplies, so it is the one a caller would otherwise be
   * able to set to any number they liked.
   */
  discountCode: z.string().trim().max(24).optional(),
  /**
   * The phone's key for this checkout attempt (see `Order.clientKey`). Random
   * and unguessable; it only ever returns an order the same table and name
   * already placed.
   */
  clientKey: z
    .string()
    .regex(/^[A-Za-z0-9-]{16,64}$/)
    .optional(),
  items: z
    .array(OrderItemInput)
    .min(1, "سبد خرید شما خالی است")
    .max(50, "تعداد اقلام سفارش بیش از حد زیاد است"),
});

export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

/**
 * What an item with no opening hours looks like.
 *
 * Shared rather than rebuilt per line, and named so the reason is visible at
 * the call site: no windows means no constraint, which is how every product
 * that predates scheduling keeps behaving exactly as it did.
 */
const UNSCHEDULED: Schedulable = { scheduleEnabled: true, windows: [] };

/** The menu facts pricing depends on. Read from the DB, never from the client. */
export interface PricedProduct {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  isAvailable: boolean;
  /**
   * Opening hours for the dish and for the category it sits in.
   *
   * Both optional, and absent means unscheduled — which is the overwhelmingly
   * common case and the behaviour every product had before this feature. That
   * is what lets the existing pricing tests, whose fixtures know nothing about
   * schedules, keep asserting exactly what they always did.
   */
  schedule?: Schedulable;
  categorySchedule?: Schedulable;
  optionGroups?: PricedOptionGroup[];
}

export interface PricedOptionGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  choices: PricedOptionChoice[];
}

export interface PricedOptionChoice {
  id: string;
  name: string;
  priceDelta: number;
  costDelta: number;
  isAvailable: boolean;
}

export interface PricedLineOption {
  groupNameSnapshot: string;
  choiceNameSnapshot: string;
  priceDeltaSnapshot: number;
  costDeltaSnapshot: number;
  sortOrder: number;
}

export interface PricedLine {
  productId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  costSnapshot: number;
  quantity: number;
  note: string | null;
  /** Both carried through unverified; `createOrder` decides what is real. */
  recommendedFrom: string | null;
  fromFeatured: boolean;
  options: PricedLineOption[];
}

/**
 * Turns requested items into priced order lines using server-held prices only.
 *
 * Extracted from createOrder() so this — the part that decides what a customer
 * is charged — can be tested without a database. The client sends product ids
 * and quantities and nothing else; price and cost come from `products`, which
 * the caller must have loaded scoped to the restaurant. A submitted price is
 * never read, so a tampered request cannot change the total.
 *
 * Name, price *and* cost are snapshotted onto the line: an order must not
 * change when the menu is later edited, and profit reporting has to stay
 * correct even after a product is deleted.
 */
export function priceOrderLines(
  items: {
    productId: string;
    quantity: number;
    note?: string;
    choiceIds?: string[];
    recommendedFrom?: string;
    fromFeatured?: boolean;
  }[],
  products: PricedProduct[],
  /**
   * The moment the order is being placed, in the venue's zone.
   *
   * Defaults to now rather than being optional-and-skippable: a caller that
   * forgets to pass it still gets the schedule enforced, which is the safe
   * direction to fail. Tests pass an explicit moment so they can state the
   * minute they mean.
   */
  at: ZonedMoment = zonedMoment(),
): { lines: PricedLine[]; subtotal: number; costTotal: number } {
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new HttpError(
        400,
        "One of the items is no longer on the menu",
        "ITEM_NOT_FOUND",
      );
    }

    /*
      The authoritative availability check.

      Hiding a dish from the menu is presentation; this is enforcement. A guest
      whose basket was filled at 21:59 submits it at 22:01 through the same code
      path as everyone else, and a caller skipping the menu entirely reaches
      here too — so this is the check that has to hold, and it is deliberately
      the same function the menu renders from.
    */
    const availability = resolveAvailability(
      {
        isAvailable: product.isAvailable,
        product: product.schedule ?? UNSCHEDULED,
        category: product.categorySchedule,
      },
      at,
    );

    if (!availability.available) {
      // The manual switch keeps its original code and message so existing
      // clients and tests are untouched; being outside opening hours is a
      // distinct, retryable situation and says so.
      if (availability.reason === "manual") {
        throw new HttpError(
          409,
          `«${product.name}» is currently unavailable`,
          "ITEM_UNAVAILABLE",
        );
      }

      throw new HttpError(
        409,
        `«${product.name}» is not being served at the moment`,
        "ITEM_NOT_SCHEDULED",
      );
    }

    const options = resolveLineOptions(product, item.choiceIds ?? []);

    // Folded into the unit price rather than kept as a separate line: every
    // existing consumer of an order — analytics, finance, the P&L, the kitchen
    // board — already multiplies priceSnapshot by quantity, and none of them
    // should have to learn about options to keep totalling correctly.
    const priceSnapshot =
      product.price + options.reduce((sum, o) => sum + o.priceDeltaSnapshot, 0);
    const costSnapshot =
      product.costPrice + options.reduce((sum, o) => sum + o.costDeltaSnapshot, 0);

    return {
      productId: product.id,
      nameSnapshot: product.name,
      // An option can be cheaper than the base dish, but a line must never go
      // negative and start subtracting from the rest of the basket.
      priceSnapshot: Math.max(0, priceSnapshot),
      costSnapshot: Math.max(0, costSnapshot),
      quantity: item.quantity,
      note: item.note ?? null,
      recommendedFrom: item.recommendedFrom ?? null,
      fromFeatured: item.fromFeatured ?? false,
      options,
    };
  });

  return {
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.priceSnapshot * l.quantity, 0),
    costTotal: lines.reduce((sum, l) => sum + l.costSnapshot * l.quantity, 0),
  };
}

/**
 * Validates a guest's choices against the product's own option groups and
 * freezes the result.
 *
 * Every rule the owner configured is enforced here rather than in the browser:
 * a required group must be answered, a group cannot be over-filled, a choice
 * must belong to the product it was sent with, and a sold-out choice is
 * refused. The client-side form enforces the same rules for usability, but this
 * is the copy that decides what is charged.
 */
function resolveLineOptions(
  product: PricedProduct,
  choiceIds: string[],
): PricedLineOption[] {
  const groups = product.optionGroups ?? [];
  if (groups.length === 0) {
    // A product with no groups must not silently accept option ids — that
    // would mean ids from another dish were being priced onto this one.
    if (choiceIds.length > 0) {
      throw new HttpError(400, "This item has no options", "OPTIONS_NOT_ALLOWED");
    }
    return [];
  }

  const wanted = new Set(choiceIds);
  const seen = new Set<string>();
  const out: PricedLineOption[] = [];

  groups.forEach((group, groupIndex) => {
    const chosen = group.choices.filter((choice) => wanted.has(choice.id));
    chosen.forEach((choice) => seen.add(choice.id));

    if (group.isRequired && chosen.length < Math.max(1, group.minSelect)) {
      throw new HttpError(
        422,
        `«${group.name}» must be chosen for «${product.name}»`,
        "OPTION_REQUIRED",
      );
    }
    if (chosen.length > group.maxSelect) {
      throw new HttpError(
        422,
        `Too many choices for «${group.name}»`,
        "OPTION_LIMIT_EXCEEDED",
      );
    }

    for (const choice of chosen) {
      if (!choice.isAvailable) {
        throw new HttpError(
          409,
          `«${choice.name}» is currently unavailable`,
          "OPTION_UNAVAILABLE",
        );
      }
      out.push({
        groupNameSnapshot: group.name,
        choiceNameSnapshot: choice.name,
        priceDeltaSnapshot: choice.priceDelta,
        costDeltaSnapshot: choice.costDelta,
        // Stable ordering so a receipt reads in the same order as the form.
        sortOrder: groupIndex * 100 + out.length,
      });
    }
  });

  // Anything left over addressed a group on a different product. Rejecting
  // rather than ignoring it: a silently dropped id means the guest is charged
  // for something other than what their screen showed them.
  const unknown = choiceIds.filter((id) => !seen.has(id));
  if (unknown.length > 0) {
    throw new HttpError(400, "Unknown option selected", "OPTION_NOT_FOUND");
  }

  return out;
}

export interface CreatedOrder {
  id: string;
  orderNumber: number;
  publicToken: string;
  total: number;
  restaurantId: string;
  paymentMethod: "CASH_ON_SITE" | "ONLINE";
  /**
   * The number actually stored — normalised, and null when this venue does not
   * collect one. Returned so the payment handoff prefills from the server's own
   * value rather than from the request body it was asked to ignore.
   */
  customerPhone: string | null;
  /** True when this is an earlier order returned for a repeated attempt. */
  replayed: boolean;
}

/**
 * The order an earlier, identical checkout attempt already placed, if any.
 *
 * Returned only to the same table and name: the key is random, but an order's
 * tracking token is not something to hand to a request that merely knows it.
 */
async function replayedOrder(
  restaurantId: string,
  input: CreateOrderInput,
): Promise<CreatedOrder | null> {
  if (!input.clientKey) return null;
  const existing = await prisma.order.findUnique({
    where: { restaurantId_clientKey: { restaurantId, clientKey: input.clientKey } },
    select: {
      id: true,
      orderNumber: true,
      publicToken: true,
      total: true,
      customerPhone: true,
      paymentMethod: true,
      tableNumber: true,
      customerName: true,
    },
  });
  if (!existing) return null;
  if (
    existing.tableNumber !== input.tableNumber ||
    existing.customerName !== input.customerName
  ) {
    throw new HttpError(409, "این سفارش قبلاً ثبت شده است.", "ORDER_KEY_REUSED");
  }
  return {
    id: existing.id,
    orderNumber: existing.orderNumber,
    publicToken: existing.publicToken,
    total: existing.total,
    customerPhone: existing.customerPhone,
    restaurantId,
    paymentMethod: existing.paymentMethod,
    replayed: true,
  };
}

/**
 * Turns a code the guest typed into an amount off, or refuses the order.
 *
 * Refuses rather than ignores. A guest who mistypes a code and is charged full
 * price with no explanation has been silently overcharged from their point of
 * view, and the first they would know of it is the bill.
 *
 * A missing code and an inactive one give the *same* answer on purpose. Saying
 * "that code is switched off" confirms it exists, which turns this endpoint
 * into a way to enumerate a venue's promotions one guess at a time.
 */
async function resolveDiscountCode(args: {
  menuOwnerId: string;
  enabled: boolean;
  raw: string | undefined;
  subtotal: number;
}): Promise<{ amount: number; code: string | null }> {
  const typed = args.raw?.trim();
  if (!typed) return { amount: 0, code: null };

  // Sending a code to a venue that does not take them is a client that has got
  // ahead of the setting, not a guest to accommodate.
  if (!args.enabled) {
    throw new HttpError(422, "این رستوران کد تخفیف نمی‌پذیرد", "DISCOUNT_CODES_DISABLED");
  }

  const code = normaliseCode(typed);
  const found = await prisma.discountCode.findUnique({
    where: { restaurantId_code: { restaurantId: args.menuOwnerId, code } },
    select: {
      code: true,
      type: true,
      value: true,
      maxDiscount: true,
      isActive: true,
    },
  });

  if (!found || !found.isActive) {
    throw new HttpError(422, "کد تخفیف معتبر نیست", "DISCOUNT_CODE_INVALID");
  }

  return { amount: discountAmountFor(args.subtotal, found), code: found.code };
}

/**
 * Places an order — once per checkout attempt.
 *
 * A repeated attempt (same `clientKey`) gets the order the first one placed,
 * whether it arrives after the first has finished (found before anything is
 * written) or at the same moment (the second insert loses on the unique key
 * and is answered with the winner's order).
 */
export async function createOrder(
  input: CreateOrderInput,
  options: { isManual?: boolean } = {},
): Promise<CreatedOrder> {
  try {
    return await placeOrder(input, options);
  } catch (error) {
    if (input.clientKey && (error as { code?: string })?.code === "P2002") {
      const venue = await prisma.restaurant.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      const replay = venue ? await replayedOrder(venue.id, input) : null;
      if (replay) return replay;
    }
    throw error;
  }
}

/**
 * Places an order.
 *
 * Prices are read from the database and snapshotted onto the order rather than
 * trusted from the client — otherwise anyone could POST their own price. The
 * per-restaurant order number is allocated by an atomic increment inside the
 * same transaction, so two simultaneous guests cannot receive the same number.
 */
async function placeOrder(
  input: CreateOrderInput,
  /**
   * Server-side facts about the order that no client may assert.
   *
   * `isManual` is a parameter rather than a field on `CreateOrderInput` on
   * purpose: the public endpoint parses that schema straight from a guest's
   * request body, so anything in it is something a guest can set. Staff origin
   * is decided by which route was called and which guard it passed, which is
   * not a thing to take on trust from the wire.
   */
  options: { isManual?: boolean } = {},
): Promise<CreatedOrder> {
  /**
   * Two rows, two responsibilities.
   *
   * `venue` is where the order lands — its id owns the order, and whether it
   * takes online orders or online payment is its own operational choice, so a
   * quiet branch can switch ordering off without touching the chain.
   *
   * `pricing` is the venue whose menu is being ordered from. Tax, service
   * charge, rounding and the minimum basket are properties of the *menu*, not
   * of the address: the guest is shown the chain's prices, so the chain's rules
   * have to be what computes the total. Reading them off the branch would let a
   * menu display one number and charge another.
   *
   * For a single site — every venue that is not a branch — the two are the same
   * row and this costs one extra query only for chains.
   */
  const pricingSelect = {
    taxEnabled: true,
    taxPercent: true,
    serviceChargeEnabled: true,
    serviceChargePercent: true,
    roundingIncrement: true,
    roundingDirection: true,
    tipEnabled: true,
    minimumOrderAmount: true,
    // A promotion belongs to the menu, like tax and service charge: a branch
    // serving the chain's dishes at the chain's prices honours the chain's
    // codes, and cannot quietly run its own.
    discountCodesEnabled: true,
    // Likewise the guest contact question. Customers are filed under the menu
    // owner, so whether guests are asked for a number is the chain's decision
    // and not something one branch can switch on for itself.
    phoneCollectionEnabled: true,
  } as const;

  const venue = await prisma.restaurant.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      parentRestaurantId: true,
      isActive: true,
      isPublished: true,
      onlineOrderingEnabled: true,
      onlinePaymentEnabled: true,
      ...pricingSelect,
    },
  });

  /*
    `isPublished` gates the *guest* path only.

    Publishing is what makes a menu visible to the public; it says nothing about
    whether the kitchen is open. Staff writing down a phone order for a venue
    that has not published yet — or has taken its menu offline for the evening —
    are doing ordinary work, and refusing them here would make the manual tab
    useless in exactly the situations it exists for. `isActive` still applies to
    both: a switched-off venue is switched off.
  */
  const staffOrigin = options.isManual === true;

  if (!venue || !venue.isActive || (!venue.isPublished && !staffOrigin)) {
    throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
  }

  const menuOwner = venue.parentRestaurantId
    ? await prisma.restaurant.findUnique({
        where: { id: venue.parentRestaurantId },
        select: { id: true, isActive: true, ...pricingSelect },
      })
    : venue;

  if (!menuOwner || ("isActive" in menuOwner && !menuOwner.isActive)) {
    throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
  }

  // Order ownership and the operational switches stay with the branch; the
  // pricing rules come from whoever owns the menu.
  const restaurant = { ...venue, ...menuOwner, id: venue.id };

  // A repeat of an attempt that already succeeded: answer with that order,
  // before anything below could refuse it (a dish sold out in between) or
  // place it a second time.
  const replay = await replayedOrder(restaurant.id, input);
  if (replay) return replay;

  // Same reasoning as `isPublished` above: this switch decides whether *guests*
  // may order from their phone. A venue that takes orders only by telephone has
  // it off by design, and that is precisely who needs the manual tab.
  if (!restaurant.onlineOrderingEnabled && !staffOrigin) {
    throw new HttpError(403, "Online ordering is disabled", "ORDERING_DISABLED");
  }
  /**
   * Two switches, and both must be on.
   *
   * `onlinePaymentEnabled` is the venue's own choice. `PAYMENTS_ENABLED` is the
   * platform's, and it was previously checked only on the *subscription*
   * checkout — the venue paying us — while a guest paying the venue went
   * straight through to the gateway. With no gateway connected that meant real
   * orders handed to a mock provider, and the day a live merchant id is added
   * it would have meant taking money nobody had switched on.
   *
   * Enforced here, in the domain function, rather than in the route: every
   * caller that can create an order goes through this.
   */
  // A manual order is taken at the counter and never opens a gateway, so an
  // online one could never be paid: refused rather than left stuck forever.
  if (staffOrigin && input.paymentMethod === "ONLINE") {
    throw new HttpError(
      422,
      "سفارش دستی فقط با پرداخت در محل ثبت می‌شود",
      "MANUAL_ORDER_ONLINE",
    );
  }

  if (
    input.paymentMethod === "ONLINE" &&
    (!PAYMENTS_ENABLED || !restaurant.onlinePaymentEnabled)
  ) {
    throw new HttpError(403, "Online payment is disabled", "ONLINE_PAYMENT_DISABLED");
  }

  /*
    Scoped to whoever owns the menu being ordered from: a product id from
    another tenant simply will not be found, so cross-tenant ordering stays
    impossible by construction.

    For a branch that owner is its parent, which is the entire point — the
    dishes belong to the chain. It is still a closed set of exactly one venue's
    products, so this is not a loosening of tenant isolation, only a correction
    of *which* tenant the dishes are expected to belong to.
  */
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId: menuOwner.id },
    select: {
      id: true,
      name: true,
      price: true,
      costPrice: true,
      isAvailable: true,
      /*
        Opening hours, for the dish and for the category it belongs to.

        Loaded here rather than checked afterwards because the enforcement has
        to happen against the same rows the prices came from. Both are nested
        selects on a query already bounded by `productIds`, so this adds two
        indexed reads to an order — not one per line.
      */
      scheduleEnabled: true,
      availabilityWindows: {
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
      // Merchandising state, so a "you featured this" claim can be checked
      // against the same rows the prices came from.
      isFeatured: true,
      featuredFrom: true,
      featuredUntil: true,
      category: {
        select: {
          scheduleEnabled: true,
          availabilityWindows: {
            select: { dayOfWeek: true, startMinute: true, endMinute: true },
          },
        },
      },
      // Loaded scoped to these products, so a choice id belonging to another
      // dish — or another tenant — is simply not in the set to match against.
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          isRequired: true,
          minSelect: true,
          maxSelect: true,
          choices: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              priceDelta: true,
              costDelta: true,
              isAvailable: true,
            },
          },
        },
      },
    },
  });

  /*
    Availability is judged at the moment the order is submitted, not when the
    basket was filled. A guest who added a dish at 21:59 and pays at 22:01 is
    refused, which is the whole point of revalidating here.
  */
  const { lines, subtotal, costTotal } = priceOrderLines(
    input.items,
    products.map((product) => ({
      ...product,
      schedule: {
        scheduleEnabled: product.scheduleEnabled,
        windows: product.availabilityWindows,
      },
      categorySchedule: {
        scheduleEnabled: product.category.scheduleEnabled,
        windows: product.category.availabilityWindows,
      },
    })),
    zonedMoment(),
  );

  if (restaurant.minimumOrderAmount > 0 && subtotal < restaurant.minimumOrderAmount) {
    throw new HttpError(
      422,
      "Order is below the minimum this restaurant accepts",
      "BELOW_MINIMUM_ORDER",
    );
  }

  // A tip only counts when the venue offers one, and it is capped against the
  // basket rather than taken on trust — the schema bound alone would still let
  // a caller attach a huge tip to a tiny order.
  const tip = restaurant.tipEnabled ? Math.min(input.tip ?? 0, subtotal * 2) : 0;

  /*
    The guest's phone number, only if this venue actually asks for one.

    Hiding the field is presentation; this is the enforcement. A stale tab open
    from before the owner switched it off, or a crafted request, would otherwise
    keep writing numbers into a customer book the venue has said it does not
    want — and a phone number is the most personal thing this product stores, so
    "not collected" has to mean not stored rather than not displayed.

    Staff are the deliberate exception, on the same reasoning as `isPublished`
    and `onlineOrderingEnabled` above: someone writing down a telephone order
    has the number in their ear, and the manual pad exists for exactly that.
    The toggle governs what *guests* are asked, which is what it says it does.
  */
  const collectedPhone =
    restaurant.phoneCollectionEnabled || staffOrigin ? input.customerPhone : undefined;

  /*
    The minimum above is checked against the undiscounted basket on purpose: a
    minimum order is about what the kitchen is willing to cook, not about what
    the venue ends up collecting, so a code must not let a guest slip under it.
  */
  const applied = await resolveDiscountCode({
    menuOwnerId: menuOwner.id,
    enabled: restaurant.discountCodesEnabled,
    raw: input.discountCode,
    subtotal,
  });

  const price = calculatePrice(subtotal, restaurant, { tip, discount: applied.amount });

  /**
   * Every money column on Order is a Postgres `integer`.
   *
   * No input bound prevents an overflow here, because the total is *derived*:
   * quantity is capped at 99 and a line at 50, but those multiply against
   * server-held prices, so a basket of individually legitimate items can exceed
   * the column's ceiling. Left unchecked the INSERT fails and the guest gets a
   * 500 on the last tap of their order. Rejecting it here turns that into the
   * same clear, translated 422 every other unacceptable basket already gets.
   */
  if (price.total > MAX_INT4 || price.subtotal > MAX_INT4 || costTotal > MAX_INT4) {
    throw new HttpError(422, "Order total is too large", "ORDER_TOTAL_TOO_LARGE");
  }

  /*
    Which "you suggested this" claims are true.

    Checked against the venue's own recommendation edges rather than believed,
    so a crafted request cannot credit a suggestion that was never made and
    inflate what the owner thinks their upsells earned. Unverifiable claims are
    dropped, never refused — the basket is perfectly valid either way, and no
    guest should lose their dinner over an analytics field.

    One query for the whole basket, and only when something was actually
    claimed, so an ordinary order pays nothing for this.
  */
  const verifiedAttributions = await verifyAttributions(
    menuOwner.id,
    lines
      .filter((line) => line.recommendedFrom)
      .map((line) => ({
        productId: line.productId,
        recommendedFrom: line.recommendedFrom!,
      })),
  );

  /*
    And which "you featured this" claims are true.

    Checked against the dish's own merchandising state rather than believed,
    for the same reason the suggestion claims are: an owner reading their
    featured-product report must be seeing sales the promotion actually
    produced. `isAvailable` is true by construction here — `priceOrderLines`
    has already refused every line that was not orderable.
  */
  const featuredById = new Map(products.map((product) => [product.id, product]));
  const orderedAt = new Date();

  const featuredNow = (productId: string) => {
    const product = featuredById.get(productId);
    return product ? isFeaturedNow({ ...product, isAvailable: true }, orderedAt) : false;
  };

  const publicToken = randomToken(24);

  const order = await prisma.$transaction(async (tx) => {
    /*
      The venue's own order number.

      `increment` rather than a read followed by a write, and the UPDATE takes a
      row lock held to commit — so two guests ordering at the same instant
      serialise here and cannot be handed the same number.
    */
    const { orderSequence } = await tx.restaurant.update({
      where: { id: restaurant.id },
      data: { orderSequence: { increment: 1 } },
      select: { orderSequence: true },
    });

    /*
      And a guard for when the counter has fallen behind the orders themselves.

      The counter is the source of truth, but it only advances through this
      function. Anything that writes `Order` rows around it — a restore from a
      partial backup, a data import, a one-off script backfilling history —
      leaves `orderSequence` below the numbers already on disk. Every subsequent
      checkout then collides with `@@unique([restaurantId, orderNumber])` and
      the guest is shown a 500 on the one screen that must never fail, with
      nothing in the interface explaining why. Observed on the development
      database, where two earlier test-data scripts had inserted 268 orders
      directly: every new order on that venue failed until the counter caught up.
      A restaurant would have experienced that as "the QR menu is broken".

      One indexed lookup on the same unique index, which returns nothing on a
      healthy venue. It runs under the row lock taken above, so the repair is as
      race-safe as the increment it corrects.
    */
    const ahead = await tx.order.findFirst({
      where: { restaurantId: restaurant.id, orderNumber: { gte: orderSequence } },
      select: { orderNumber: true },
      orderBy: { orderNumber: "desc" },
    });

    const orderNumber = ahead ? ahead.orderNumber + 1 : orderSequence;

    if (ahead) {
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: { orderSequence: orderNumber },
      });
    }

    /*
      Recognise the guest, if they gave a number.

      Inside the order transaction so an order and the customer record it
      belongs to either both land or neither does. Filed under the *menu owner*,
      so a chain sees one customer across its branches while each branch keeps
      the order — and therefore the revenue — that it served.
    */
    const customerId = await linkCustomer(tx, menuOwner.id, {
      phone: collectedPhone ?? null,
      name: input.customerName,
    });

    const created = await tx.order.create({
      data: {
        customerId,
        restaurantId: restaurant.id,
        orderNumber,
        publicToken,
        isManual: options.isManual ?? false,
        clientKey: input.clientKey ?? null,
        tableNumber: input.tableNumber,
        customerName: input.customerName,
        /*
          Stored in one canonical form rather than as typed.

          This column is the only thing that identifies a returning guest —
          there is no account behind it — so the same person typing
          «۰۹۱۲۱۲۳۴۵۶۷» tonight and `0912 123 4567` next week has to end up as
          one customer rather than two. Normalising on the way in keeps that
          true for every reader without each of them having to remember, and
          costs nothing here; doing it later would mean rewriting live orders.
        */
        customerPhone: normalisePhone(collectedPhone),
        note: input.note ?? null,
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        status: "RECEIVED",
        subtotal: price.subtotal,
        discount: price.discount,
        discountCode: applied.code,
        serviceCharge: price.serviceCharge,
        tax: price.tax,
        tip: price.tip,
        roundingAdjustment: price.roundingAdjustment,
        total: price.total,
        costTotal,
        items: {
          create: lines.map(({ options, recommendedFrom, fromFeatured, ...line }) => ({
            ...line,
            // Only credited when the dish really was being promoted at the
            // moment the order was placed.
            fromFeatured: fromFeatured && featuredNow(line.productId),
            // Only what survived verification above reaches the column.
            recommendedFromProductId:
              recommendedFrom &&
              verifiedAttributions.has(attributionKey(line.productId, recommendedFrom))
                ? recommendedFrom
                : null,
            options: options.length > 0 ? { create: options } : undefined,
          })),
        },
        events: { create: { status: "RECEIVED" } },
      },
      select: {
        id: true,
        orderNumber: true,
        publicToken: true,
        total: true,
        customerPhone: true,
      },
    });

    /*
      Take the ingredients off the shelves, in the same transaction.

      Scoped to the *menu owner's* items, because a recipe hangs off a product
      and products belong to whoever owns the menu. For a single site — nearly
      every venue — that is the same row. For a chain it means one shared set of
      shelves rather than one per branch; see the note in
      dashboard/options/inventory.

      Stock is allowed to go negative rather than the order being refused. A
      count is only ever as good as the last time someone updated it, and
      turning a stale number into "we cannot take your order" would be a far
      worse failure than showing a deficit the owner can correct.
    */
    await deductStock(tx, {
      menuOwnerId: menuOwner.id,
      orderId: created.id,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      })),
    });

    return created;
  });

  publishOrderEvent({
    type: "order.created",
    restaurantId: restaurant.id,
    orderId: order.id,
    publicToken: order.publicToken,
    status: "RECEIVED",
    at: new Date().toISOString(),
  });

  return {
    ...order,
    restaurantId: restaurant.id,
    paymentMethod: input.paymentMethod,
    replayed: false,
  };
}

/** Timestamp column written when an order reaches each status. */
const STATUS_TIMESTAMP = {
  RECEIVED: null,
  PREPARING: "preparingAt",
  READY: "readyAt",
  DELIVERED: "deliveredAt",
  CANCELED: "canceledAt",
} as const;

/**
 * Moves an order along the kitchen workflow. `restaurantId` comes from the
 * caller's session, so staff cannot touch another venue's orders even with a
 * valid order id.
 */
export async function updateOrderStatus(
  restaurantId: string,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const existing = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true, status: true, publicToken: true },
  });

  if (!existing) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");
  if (existing.status === status) return;
  if (!canMoveOrder(existing.status, status)) {
    throw new HttpError(
      409,
      "این تغییر وضعیت برای این سفارش مجاز نیست",
      "INVALID_TRANSITION",
    );
  }

  const timestampField = STATUS_TIMESTAMP[status];

  /*
    Callback form rather than the array form, so cancelling can put the
    ingredients back inside the same transaction that records the cancellation.
    A restore committed separately could survive a failed status update and
    credit stock for an order that is still live.
  */
  await prisma.$transaction(async (tx) => {
    // Conditional on the status read above. Two taps on «لغو» from two screens
    // used to both pass the check and both put the ingredients back; now the
    // second finds the order already moved and changes nothing.
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: existing.status },
      data: {
        status,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
    });
    if (moved.count === 0) {
      throw new HttpError(
        409,
        "وضعیت این سفارش همین حالا تغییر کرد؛ صفحه را دوباره ببینید",
        "ORDER_CHANGED",
      );
    }

    await tx.orderEvent.create({ data: { orderId, status } });

    // Only on the way *into* CANCELED, and only by the request that won the
    // conditional update above. The unique ledger index on (order, item,
    // reason) is the database-level belt to that brace.
    if (status === "CANCELED") await restoreStockForOrder(tx, orderId);
  });

  publishOrderEvent({
    type: "order.updated",
    restaurantId,
    orderId,
    publicToken: existing.publicToken,
    status,
    at: new Date().toISOString(),
  });
}

/**
 * Records that a guest settled their bill in cash at the table.
 *
 * A paid online order is never touched: its status was written by the gateway
 * after a server-to-server verification, and letting a staff member flip that
 * by hand would make the one field that proves money moved editable from the
 * floor.
 *
 * An online order whose payment never completed is different: the guest is
 * paying at the counter instead. Marking it paid records exactly that — the
 * method becomes «پرداخت در محل» — so the order is no longer stuck as unpaid
 * forever, which it used to be.
 *
 * Idempotent, because two people clearing tables will both tap it.
 */
export async function markOrderPaid(
  restaurantId: string,
  orderId: string,
  paid: boolean,
): Promise<{ paymentStatus: "PAID" | "PENDING" }> {
  const existing = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true, paymentMethod: true, paymentStatus: true, publicToken: true },
  });

  if (!existing) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

  const settlingUnpaidOnline =
    existing.paymentMethod === "ONLINE" && existing.paymentStatus !== "PAID" && paid;
  if (existing.paymentMethod !== "CASH_ON_SITE" && !settlingUnpaidOnline) {
    throw new HttpError(
      409,
      "Online payments are settled by the gateway",
      "PAYMENT_NOT_MANUAL",
    );
  }

  const next = paid ? "PAID" : "PENDING";
  if (existing.paymentStatus === next) return { paymentStatus: next };

  /*
    `paidAt` moves with `paymentStatus`, never independently.

    The board retires a finished order an hour after it was delivered *and*
    paid, so the timestamp is what starts that clock. Clearing it when an owner
    un-marks a bill matters as much as setting it: a stale `paidAt` on an order
    that is no longer paid would retire it while the money is still owed.
  */
  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: next,
      paidAt: paid ? new Date() : null,
      ...(settlingUnpaidOnline ? { paymentMethod: "CASH_ON_SITE" as const } : {}),
    },
  });

  // The board and the guest's tracking page both listen, so the badge turns
  // green on every open screen rather than only on the one that tapped it.
  publishOrderEvent({
    type: "order.updated",
    restaurantId,
    orderId,
    publicToken: existing.publicToken,
    at: new Date().toISOString(),
  });

  return { paymentStatus: next };
}

/**
 * Cancels an online order whose payment did not complete — but only while the
 * kitchen has not started it. Returns whether it cancelled anything.
 *
 * Called when the gateway reports a failed or abandoned payment, and by the
 * sweep below for guests who never came back from the gateway at all. Without
 * this an unpaid online order stayed on the board, counted as a sale and held
 * its ingredients indefinitely.
 */
export async function cancelUnpaidOnlineOrder(
  restaurantId: string,
  orderId: string,
): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { status: true, paymentMethod: true, paymentStatus: true },
  });
  if (
    !order ||
    order.paymentMethod !== "ONLINE" ||
    order.paymentStatus === "PAID" ||
    order.status !== "RECEIVED"
  ) {
    return false;
  }
  try {
    await updateOrderStatus(restaurantId, orderId, "CANCELED");
    return true;
  } catch (error) {
    // Someone moved it in the meantime — the kitchen took it, or it was paid.
    if (error instanceof HttpError && error.code === "ORDER_CHANGED") return false;
    throw error;
  }
}

/**
 * Cancels this venue's online orders that have waited for payment longer than
 * ONLINE_PAYMENT_WINDOW_MINUTES without the kitchen starting them.
 *
 * Run lazily whenever the order board loads or refreshes, which is exactly
 * when someone would otherwise see a ghost order. Cheap: it reads only received,
 * unpaid online orders of one venue. A guest who pays after the window lands
 * in the refund queue (cancelled but paid), which is the existing path for
 * exactly that case.
 */
export async function expireAbandonedOnlineOrders(restaurantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - ONLINE_PAYMENT_WINDOW_MINUTES * 60_000);
  const stale = await prisma.order.findMany({
    where: {
      restaurantId,
      status: "RECEIVED",
      paymentMethod: "ONLINE",
      paymentStatus: { not: "PAID" },
      placedAt: { lt: cutoff },
    },
    select: { id: true },
    take: 50,
  });
  let cancelled = 0;
  for (const order of stale) {
    if (await cancelUnpaidOnlineOrder(restaurantId, order.id)) cancelled += 1;
  }
  return cancelled;
}

/** The guest's view, addressed by unguessable token rather than by id. */
export async function getOrderByToken(slug: string, token: string) {
  return prisma.order.findFirst({
    where: { publicToken: token, restaurant: { slug } },
    include: {
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      // So a guest returning to the link sees the rating they already left
      // rather than being asked for it again.
      review: { select: { rating: true, comment: true } },
      restaurant: {
        select: {
          name: true,
          slug: true,
          logoUrl: true,
          showPrices: true,
          showOrderDiscount: true,
        },
      },
    },
  });
}
