import { describe, expect, it } from "vitest";
import { priceOrderLines, type PricedProduct } from "./orders";
import { HttpError } from "./auth/guards";

/**
 * Options change what a guest is charged, and the deltas arrive as ids rather
 * than amounts precisely so the client cannot set a price. These tests pin both
 * halves of that: the arithmetic, and the refusal to price anything the product
 * did not actually offer.
 */

const BURGER: PricedProduct = {
  id: "p-burger",
  name: "برگر ویژه",
  price: 320_000,
  costPrice: 140_000,
  isAvailable: true,
  optionGroups: [
    {
      id: "g-meat",
      name: "انتخاب گوشت",
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      choices: [
        {
          id: "c-chicken",
          name: "مرغ",
          priceDelta: 0,
          costDelta: 0,
          isAvailable: true,
        },
        {
          id: "c-beef",
          name: "گوشت گوساله",
          priceDelta: 60_000,
          costDelta: 35_000,
          isAvailable: true,
        },
        {
          id: "c-lamb",
          name: "گوشت بره",
          priceDelta: 90_000,
          costDelta: 55_000,
          isAvailable: false,
        },
      ],
    },
    {
      id: "g-extras",
      name: "افزودنی",
      isRequired: false,
      minSelect: 0,
      maxSelect: 2,
      choices: [
        {
          id: "c-cheese",
          name: "پنیر اضافه",
          priceDelta: 25_000,
          costDelta: 9_000,
          isAvailable: true,
        },
        {
          id: "c-bacon",
          name: "قارچ",
          priceDelta: 20_000,
          costDelta: 7_000,
          isAvailable: true,
        },
        {
          id: "c-small",
          name: "بدون نان (کم‌کربوهیدرات)",
          priceDelta: -15_000,
          costDelta: -4_000,
          isAvailable: true,
        },
      ],
    },
  ],
};

/** A product with no options at all — the overwhelming majority of a menu. */
const TEA: PricedProduct = {
  id: "p-tea",
  name: "چای",
  price: 45_000,
  costPrice: 9_000,
  isAvailable: true,
};

const line = (choiceIds: string[], quantity = 1) =>
  priceOrderLines([{ productId: "p-burger", quantity, choiceIds }], [BURGER]);

describe("pricing with options", () => {
  it("adds the chosen delta to the unit price", () => {
    const { lines, subtotal } = line(["c-beef"]);
    expect(lines[0].priceSnapshot).toBe(380_000);
    expect(subtotal).toBe(380_000);
  });

  it("adds the matching cost delta so profit stays honest", () => {
    const { lines, costTotal } = line(["c-beef"]);
    expect(lines[0].costSnapshot).toBe(175_000);
    expect(costTotal).toBe(175_000);
  });

  it("sums several choices across groups", () => {
    const { lines } = line(["c-beef", "c-cheese", "c-bacon"]);
    expect(lines[0].priceSnapshot).toBe(320_000 + 60_000 + 25_000 + 20_000);
    expect(lines[0].costSnapshot).toBe(140_000 + 35_000 + 9_000 + 7_000);
  });

  it("multiplies the option-inclusive unit price by quantity", () => {
    const { subtotal } = line(["c-beef"], 3);
    expect(subtotal).toBe(380_000 * 3);
  });

  it("honours a negative delta, but never lets a line go below zero", () => {
    const { lines } = line(["c-chicken", "c-small"]);
    expect(lines[0].priceSnapshot).toBe(305_000);

    const freeish = priceOrderLines(
      [{ productId: "p-cheap", quantity: 1, choiceIds: ["c-discount"] }],
      [
        {
          id: "p-cheap",
          name: "نان",
          price: 10_000,
          costPrice: 3_000,
          isAvailable: true,
          optionGroups: [
            {
              id: "g",
              name: "اندازه",
              isRequired: false,
              minSelect: 0,
              maxSelect: 1,
              choices: [
                {
                  id: "c-discount",
                  name: "نصف",
                  priceDelta: -999_000,
                  costDelta: -999_000,
                  isAvailable: true,
                },
              ],
            },
          ],
        },
      ],
    );
    expect(freeish.lines[0].priceSnapshot).toBe(0);
    expect(freeish.subtotal).toBe(0);
  });
});

describe("snapshotting", () => {
  it("freezes the group and choice names onto the line", () => {
    const { lines } = line(["c-beef", "c-cheese"]);
    expect(lines[0].options).toEqual([
      expect.objectContaining({
        groupNameSnapshot: "انتخاب گوشت",
        choiceNameSnapshot: "گوشت گوساله",
        priceDeltaSnapshot: 60_000,
        costDeltaSnapshot: 35_000,
      }),
      expect.objectContaining({
        groupNameSnapshot: "افزودنی",
        choiceNameSnapshot: "پنیر اضافه",
        priceDeltaSnapshot: 25_000,
      }),
    ]);
  });

  it("records nothing when no option was chosen", () => {
    const { lines } = priceOrderLines([{ productId: "p-tea", quantity: 1 }], [TEA]);
    expect(lines[0].options).toEqual([]);
  });
});

describe("what a tampered request cannot do", () => {
  it("refuses a choice belonging to a different product", () => {
    expect(() =>
      priceOrderLines(
        [{ productId: "p-tea", quantity: 1, choiceIds: ["c-beef"] }],
        [TEA, BURGER],
      ),
    ).toThrow(HttpError);
  });

  it("refuses an id that matches no choice at all", () => {
    expect(() => line(["c-chicken", "c-does-not-exist"])).toThrow(/Unknown option/);
  });

  it("refuses a sold-out choice", () => {
    expect(() => line(["c-lamb"])).toThrow(/unavailable/i);
  });

  it("refuses more choices than the group allows", () => {
    expect(() => line(["c-chicken", "c-cheese", "c-bacon", "c-small"])).toThrow(
      /Too many choices/,
    );
  });

  it("refuses to skip a required group", () => {
    expect(() => line(["c-cheese"])).toThrow(/must be chosen/);
  });

  it("allows skipping an optional group", () => {
    const { lines } = line(["c-chicken"]);
    expect(lines[0].priceSnapshot).toBe(320_000);
  });
});

describe("products without options are untouched", () => {
  it("prices exactly as before", () => {
    const { subtotal, costTotal, lines } = priceOrderLines(
      [{ productId: "p-tea", quantity: 2 }],
      [TEA],
    );
    expect(subtotal).toBe(90_000);
    expect(costTotal).toBe(18_000);
    expect(lines[0].priceSnapshot).toBe(45_000);
  });
});
