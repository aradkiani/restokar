import { describe, expect, it } from "vitest";
import { CreateOrderInput, priceOrderLines, type PricedProduct } from "./orders";
import { HttpError } from "./auth/guards";

/**
 * Order pricing is the code path where a bug costs a restaurant real money, so
 * it gets the most direct coverage in the suite.
 */

const ESPRESSO: PricedProduct = {
  id: "p-espresso",
  name: "اسپرسو",
  price: 55_000,
  costPrice: 18_000,
  isAvailable: true,
};

const MOCHA: PricedProduct = {
  id: "p-mocha",
  name: "موکا",
  price: 105_000,
  costPrice: 38_000,
  isAvailable: true,
};

describe("priceOrderLines", () => {
  it("multiplies price by quantity and sums the subtotal", () => {
    const { subtotal } = priceOrderLines(
      [
        { productId: "p-espresso", quantity: 2 },
        { productId: "p-mocha", quantity: 1 },
      ],
      [ESPRESSO, MOCHA],
    );

    expect(subtotal).toBe(55_000 * 2 + 105_000);
  });

  it("tracks cost separately from price so gross profit stays derivable", () => {
    const { subtotal, costTotal } = priceOrderLines(
      [{ productId: "p-mocha", quantity: 3 }],
      [MOCHA],
    );

    expect(subtotal).toBe(315_000);
    expect(costTotal).toBe(114_000);
    expect(subtotal - costTotal).toBe(201_000);
  });

  it("ignores any price supplied by the client", () => {
    // A tampered payload claiming the espresso costs 1 Toman.
    const tampered = [{ productId: "p-espresso", quantity: 1, price: 1 }] as unknown as {
      productId: string;
      quantity: number;
    }[];

    const { subtotal, lines } = priceOrderLines(tampered, [ESPRESSO]);

    expect(subtotal).toBe(55_000);
    expect(lines[0].priceSnapshot).toBe(55_000);
  });

  it("snapshots name, price and cost onto the line", () => {
    const { lines } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1 }],
      [ESPRESSO],
    );

    expect(lines[0]).toMatchObject({
      productId: "p-espresso",
      nameSnapshot: "اسپرسو",
      priceSnapshot: 55_000,
      costSnapshot: 18_000,
      quantity: 1,
      note: null,
    });
  });

  it("rejects a product the restaurant does not own", () => {
    // Cross-tenant defence: the caller loads products scoped to the
    // restaurant, so a foreign id is simply absent from the list.
    expect(() =>
      priceOrderLines([{ productId: "p-from-other-venue", quantity: 1 }], [ESPRESSO]),
    ).toThrowError(HttpError);

    try {
      priceOrderLines([{ productId: "p-from-other-venue", quantity: 1 }], [ESPRESSO]);
    } catch (error) {
      expect((error as HttpError).status).toBe(400);
      expect((error as HttpError).code).toBe("ITEM_NOT_FOUND");
    }
  });

  it("rejects an unavailable product", () => {
    const soldOut = { ...ESPRESSO, isAvailable: false };

    try {
      priceOrderLines([{ productId: "p-espresso", quantity: 1 }], [soldOut]);
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).status).toBe(409);
      expect((error as HttpError).code).toBe("ITEM_UNAVAILABLE");
    }
  });

  it("prices a repeated product id as separate lines", () => {
    const { lines, subtotal } = priceOrderLines(
      [
        { productId: "p-espresso", quantity: 1, note: "بدون شکر" },
        { productId: "p-espresso", quantity: 2 },
      ],
      [ESPRESSO],
    );

    expect(lines).toHaveLength(2);
    expect(lines[0].note).toBe("بدون شکر");
    expect(subtotal).toBe(55_000 * 3);
  });

  it("returns zero totals for an empty basket", () => {
    expect(priceOrderLines([], [ESPRESSO])).toEqual({
      lines: [],
      subtotal: 0,
      costTotal: 0,
    });
  });
});

/**
 * Server-side enforcement of opening hours.
 *
 * Hiding a dish from the menu is presentation. These are the checks that
 * actually stop it being bought, and they run on the same function every
 * caller goes through — so a request that never loaded the menu, or one built
 * by hand, hits exactly this.
 */
describe("priceOrderLines — opening hours", () => {
  const SAT = 6;
  const SUN = 0;

  /** 18:00 → 23:00 on Saturday. */
  const dinnerOnly: PricedProduct = {
    ...ESPRESSO,
    schedule: {
      scheduleEnabled: true,
      windows: [{ dayOfWeek: SAT, startMinute: 18 * 60, endMinute: 23 * 60 }],
    },
  };

  const at = (dayOfWeek: number, hour: number, minute = 0) => ({
    dayOfWeek,
    minuteOfDay: hour * 60 + minute,
  });

  it("prices a scheduled product inside its window", () => {
    const { subtotal } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1 }],
      [dinnerOnly],
      at(SAT, 20),
    );

    expect(subtotal).toBe(55_000);
  });

  it("refuses a scheduled product outside its window", () => {
    try {
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1 }],
        [dinnerOnly],
        at(SAT, 12),
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).status).toBe(409);
      expect((error as HttpError).code).toBe("ITEM_NOT_SCHEDULED");
    }
  });

  /**
   * The cart scenario from the brief: added at 21:59, submitted at 22:01,
   * against a window that closes at 22:00. Availability is judged when the
   * order is placed, never when the basket was filled.
   */
  it("refuses an item whose window closed while it sat in the cart", () => {
    const closesAtTen: PricedProduct = {
      ...ESPRESSO,
      schedule: {
        scheduleEnabled: true,
        windows: [{ dayOfWeek: SAT, startMinute: 18 * 60, endMinute: 22 * 60 }],
      },
    };

    // Filling the basket succeeded a couple of minutes earlier…
    expect(
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1 }],
        [closesAtTen],
        at(SAT, 21, 59),
      ).subtotal,
    ).toBe(55_000);

    // …and submitting it now does not.
    expect(() =>
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1 }],
        [closesAtTen],
        at(SAT, 22, 1),
      ),
    ).toThrow(HttpError);
  });

  it("refuses a product whose category is closed, even inside its own window", () => {
    const inClosedCategory: PricedProduct = {
      ...dinnerOnly,
      categorySchedule: {
        scheduleEnabled: true,
        windows: [{ dayOfWeek: SAT, startMinute: 7 * 60, endMinute: 11 * 60 }],
      },
    };

    try {
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1 }],
        [inClosedCategory],
        at(SAT, 20),
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).code).toBe("ITEM_NOT_SCHEDULED");
    }
  });

  it("serves an overnight window in the small hours of the next day", () => {
    const lateNight: PricedProduct = {
      ...ESPRESSO,
      schedule: {
        scheduleEnabled: true,
        windows: [{ dayOfWeek: SAT, startMinute: 18 * 60, endMinute: 2 * 60 }],
      },
    };

    expect(
      priceOrderLines([{ productId: "p-espresso", quantity: 1 }], [lateNight], at(SUN, 1))
        .subtotal,
    ).toBe(55_000);
  });

  it("ignores the hours entirely once the owner switches them off", () => {
    const suspended: PricedProduct = {
      ...dinnerOnly,
      schedule: { ...dinnerOnly.schedule!, scheduleEnabled: false },
    };

    expect(
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1 }],
        [suspended],
        at(SAT, 12),
      ).subtotal,
    ).toBe(55_000);
  });

  /** The regression that matters most: nothing changes for unscheduled dishes. */
  it("leaves a product with no schedule orderable at any hour", () => {
    for (const day of [SAT, SUN, 3]) {
      for (const hour of [0, 4, 12, 23]) {
        expect(
          priceOrderLines(
            [{ productId: "p-espresso", quantity: 1 }],
            [ESPRESSO],
            at(day, hour),
          ).subtotal,
        ).toBe(55_000);
      }
    }
  });

  it("still reports a manually disabled product as unavailable, not unscheduled", () => {
    const soldOut: PricedProduct = { ...dinnerOnly, isAvailable: false };

    try {
      priceOrderLines([{ productId: "p-espresso", quantity: 1 }], [soldOut], at(SAT, 20));
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).code).toBe("ITEM_UNAVAILABLE");
    }
  });

  /**
   * Options are validated by the same pass that prices the line, so a dish
   * refused on its hours must be refused before its options are considered —
   * otherwise a required-option error would mask the real reason.
   */
  it("refuses on hours before complaining about a missing required option", () => {
    const withRequiredOption: PricedProduct = {
      ...dinnerOnly,
      optionGroups: [
        {
          id: "g-milk",
          name: "شیر",
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          choices: [
            {
              id: "c-oat",
              name: "جو دوسر",
              priceDelta: 15_000,
              costDelta: 5_000,
              isAvailable: true,
            },
          ],
        },
      ],
    };

    try {
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1 }],
        [withRequiredOption],
        at(SAT, 12),
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).code).toBe("ITEM_NOT_SCHEDULED");
    }
  });

  it("prices options normally inside the window", () => {
    const withOption: PricedProduct = {
      ...dinnerOnly,
      optionGroups: [
        {
          id: "g-milk",
          name: "شیر",
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          choices: [
            {
              id: "c-oat",
              name: "جو دوسر",
              priceDelta: 15_000,
              costDelta: 5_000,
              isAvailable: true,
            },
          ],
        },
      ],
    };

    const { subtotal, lines } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1, choiceIds: ["c-oat"] }],
      [withOption],
      at(SAT, 20),
    );

    expect(subtotal).toBe(70_000);
    expect(lines[0].options).toHaveLength(1);
  });
});

describe("CreateOrderInput", () => {
  const valid = {
    slug: "cafe-nabsh",
    tableNumber: "12",
    customerName: "آراد",
    items: [{ productId: "p-espresso", quantity: 1 }],
  };

  it("accepts a well-formed order and defaults to paying on site", () => {
    const parsed = CreateOrderInput.parse(valid);
    expect(parsed.paymentMethod).toBe("CASH_ON_SITE");
  });

  it("rejects an empty basket with guest-readable Persian copy", () => {
    const result = CreateOrderInput.safeParse({ ...valid, items: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("سبد خرید شما خالی است");
    }
  });

  it("rejects a missing name and table number", () => {
    const result = CreateOrderInput.safeParse({
      ...valid,
      customerName: "",
      tableNumber: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("نام خود را وارد کنید");
      expect(messages).toContain("شماره میز را وارد کنید");
    }
  });

  it("rejects zero, negative and fractional quantities", () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = CreateOrderInput.safeParse({
        ...valid,
        items: [{ productId: "p-espresso", quantity }],
      });
      expect(result.success, `quantity ${quantity} should be rejected`).toBe(false);
    }
  });

  it("caps quantity and basket size", () => {
    expect(
      CreateOrderInput.safeParse({
        ...valid,
        items: [{ productId: "p-espresso", quantity: 100 }],
      }).success,
    ).toBe(false);

    expect(
      CreateOrderInput.safeParse({
        ...valid,
        items: Array.from({ length: 51 }, () => ({
          productId: "p-espresso",
          quantity: 1,
        })),
      }).success,
    ).toBe(false);
  });
});

/**
 * Upselling touches the order path in exactly one place: a line may carry the
 * dish whose suggestion produced it. Everything else — pricing, option rules,
 * availability — must behave identically whether a line came from a suggestion
 * or from the menu, which is what these assert.
 */
describe("priceOrderLines — recommendation attribution", () => {
  const OPEN_NOW = { dayOfWeek: 1, minuteOfDay: 12 * 60 };

  it("carries the claimed source onto the line", () => {
    const { lines } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1, recommendedFrom: "p-mocha" }],
      [ESPRESSO],
      OPEN_NOW,
    );

    expect(lines[0]!.recommendedFrom).toBe("p-mocha");
  });

  it("leaves a line the guest found themselves unattributed", () => {
    const { lines } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1 }],
      [ESPRESSO],
      OPEN_NOW,
    );

    expect(lines[0]!.recommendedFrom).toBeNull();
  });

  /**
   * The claim is metadata, never an input to the arithmetic. A caller cannot
   * discount a dish by pretending it was suggested.
   */
  it("does not let the claim change what is charged", () => {
    const plain = priceOrderLines(
      [{ productId: "p-mocha", quantity: 2 }],
      [MOCHA],
      OPEN_NOW,
    );
    const claimed = priceOrderLines(
      [{ productId: "p-mocha", quantity: 2, recommendedFrom: "p-espresso" }],
      [MOCHA],
      OPEN_NOW,
    );

    expect(claimed.subtotal).toBe(plain.subtotal);
    expect(claimed.costTotal).toBe(plain.costTotal);
    expect(claimed.lines[0]!.priceSnapshot).toBe(plain.lines[0]!.priceSnapshot);
  });

  it("still refuses an unavailable dish that was suggested", () => {
    expect(() =>
      priceOrderLines(
        [{ productId: "p-sold-out", quantity: 1, recommendedFrom: "p-espresso" }],
        [{ ...ESPRESSO, id: "p-sold-out", isAvailable: false }],
        OPEN_NOW,
      ),
    ).toThrow(HttpError);
  });

  it("still refuses a dish outside its serving hours that was suggested", () => {
    try {
      priceOrderLines(
        [{ productId: "p-espresso", quantity: 1, recommendedFrom: "p-mocha" }],
        [
          {
            ...ESPRESSO,
            schedule: {
              scheduleEnabled: true,
              // Open on Saturday only; the moment below is a Monday.
              windows: [{ dayOfWeek: 6, startMinute: 0, endMinute: 1440 }],
            },
          },
        ],
        OPEN_NOW,
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).code).toBe("ITEM_NOT_SCHEDULED");
    }
  });

  /**
   * A suggested dish is an ordinary dish: the same option rules decide what it
   * costs and whether it may be ordered at all.
   */
  it("applies the existing option rules to a suggested dish", () => {
    const PIZZA: PricedProduct = {
      id: "p-pizza",
      name: "پیتزا",
      price: 200_000,
      costPrice: 70_000,
      isAvailable: true,
      optionGroups: [
        {
          id: "g-size",
          name: "اندازه",
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          choices: [
            {
              id: "c-large",
              name: "بزرگ",
              priceDelta: 60_000,
              costDelta: 20_000,
              isAvailable: true,
            },
          ],
        },
      ],
    };

    // The required group is answered: priced through the same path as any dish.
    const { lines } = priceOrderLines(
      [
        {
          productId: "p-pizza",
          quantity: 1,
          choiceIds: ["c-large"],
          recommendedFrom: "p-espresso",
        },
      ],
      [PIZZA],
      OPEN_NOW,
    );

    expect(lines[0]!.priceSnapshot).toBe(260_000);
    expect(lines[0]!.recommendedFrom).toBe("p-espresso");

    // Unanswered, it is refused exactly as it would be from the menu.
    try {
      priceOrderLines(
        [{ productId: "p-pizza", quantity: 1, recommendedFrom: "p-espresso" }],
        [PIZZA],
        OPEN_NOW,
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as HttpError).code).toBe("OPTION_REQUIRED");
    }
  });

  it("accepts the claim through the request schema", () => {
    const result = CreateOrderInput.safeParse({
      slug: "cafe",
      tableNumber: "5",
      customerName: "آراد",
      items: [{ productId: "p-espresso", quantity: 1, recommendedFrom: "p-mocha" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]!.recommendedFrom).toBe("p-mocha");
    }
  });
});

/**
 * Merchandising touches the order path in one place: a line may record that the
 * guest reached the dish through a featured surface. Everything else must be
 * identical to an ordinary line.
 */
describe("priceOrderLines — featured attribution", () => {
  const OPEN_NOW = { dayOfWeek: 1, minuteOfDay: 12 * 60 };

  it("carries the claim onto the line", () => {
    const { lines } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1, fromFeatured: true }],
      [ESPRESSO],
      OPEN_NOW,
    );

    expect(lines[0]!.fromFeatured).toBe(true);
  });

  it("leaves an ordinary line unattributed", () => {
    const { lines } = priceOrderLines(
      [{ productId: "p-espresso", quantity: 1 }],
      [ESPRESSO],
      OPEN_NOW,
    );

    expect(lines[0]!.fromFeatured).toBe(false);
  });

  it("does not let the claim change what is charged", () => {
    const plain = priceOrderLines(
      [{ productId: "p-mocha", quantity: 2 }],
      [MOCHA],
      OPEN_NOW,
    );
    const claimed = priceOrderLines(
      [{ productId: "p-mocha", quantity: 2, fromFeatured: true }],
      [MOCHA],
      OPEN_NOW,
    );

    expect(claimed.subtotal).toBe(plain.subtotal);
    expect(claimed.costTotal).toBe(plain.costTotal);
    expect(claimed.lines[0]!.priceSnapshot).toBe(plain.lines[0]!.priceSnapshot);
  });

  it("still refuses an unavailable dish that was featured", () => {
    expect(() =>
      priceOrderLines(
        [{ productId: "p-sold-out", quantity: 1, fromFeatured: true }],
        [{ ...ESPRESSO, id: "p-sold-out", isAvailable: false }],
        OPEN_NOW,
      ),
    ).toThrow(HttpError);
  });

  it("carries both attributions independently", () => {
    const { lines } = priceOrderLines(
      [
        {
          productId: "p-espresso",
          quantity: 1,
          fromFeatured: true,
          recommendedFrom: "p-mocha",
        },
      ],
      [ESPRESSO],
      OPEN_NOW,
    );

    expect(lines[0]!.fromFeatured).toBe(true);
    expect(lines[0]!.recommendedFrom).toBe("p-mocha");
  });

  it("accepts the claim through the request schema", () => {
    const result = CreateOrderInput.safeParse({
      slug: "cafe",
      tableNumber: "5",
      customerName: "آراد",
      items: [{ productId: "p-espresso", quantity: 1, fromFeatured: true }],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items[0]!.fromFeatured).toBe(true);
  });
});
