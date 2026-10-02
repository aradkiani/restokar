import { describe, expect, it } from "vitest";
import { firstSteps, showFirstSteps, type VenueSetup } from "./first-steps";

const fresh: VenueSetup = {
  slug: "new-cafe",
  logoUrl: null,
  tagline: null,
  phone: null,
  address: null,
  templateId: "aurora",
  theme: {},
  products: 0,
  tables: 0,
  orders: 0,
};

const doneKeys = (venue: VenueSetup) =>
  firstSteps(venue, "aurora")
    .filter((step) => step.done)
    .map((step) => step.key);

describe("first steps", () => {
  it("starts with nothing ticked for a brand-new venue", () => {
    expect(doneKeys(fresh)).toEqual([]);
    expect(showFirstSteps(firstSteps(fresh, "aurora"), 0)).toBe(true);
  });

  it("ticks each step from the venue's own data", () => {
    expect(doneKeys({ ...fresh, address: "تهران" })).toEqual(["details"]);
    expect(doneKeys({ ...fresh, products: 3 })).toEqual(["menu"]);
    expect(doneKeys({ ...fresh, templateId: "noir" })).toEqual(["design"]);
    expect(doneKeys({ ...fresh, theme: { primary: "#000" } })).toEqual(["design"]);
    expect(doneKeys({ ...fresh, tables: 1 })).toEqual(["tables"]);
    expect(doneKeys({ ...fresh, orders: 1 })).toEqual(["order"]);
  });

  it("points the test order at the venue's own menu", () => {
    const order = firstSteps(fresh, "aurora").find((step) => step.key === "order");
    expect(order?.href).toBe("/menu/new-cafe");
  });

  it("goes away when everything is done, or once the venue is trading", () => {
    const complete = {
      ...fresh,
      logoUrl: "/uploads/x.png",
      products: 4,
      templateId: "noir",
      tables: 2,
      orders: 1,
    };
    expect(showFirstSteps(firstSteps(complete, "aurora"), 1)).toBe(false);
    // Established venue with no logo and the default design: not nagged.
    const trading = { ...fresh, products: 20, tables: 8, orders: 40 };
    expect(showFirstSteps(firstSteps(trading, "aurora"), 40)).toBe(false);
  });
});
