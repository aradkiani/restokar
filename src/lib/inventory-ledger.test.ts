import { describe, expect, it } from "vitest";
import {
  WASTE_REASONS,
  countVariance,
  effectiveUnitCost,
  inventoryLosses,
  isWasteReason,
  purchaseUnitCost,
  valueOf,
  weightedAverage,
} from "./inventory-ledger";

describe("valueOf", () => {
  it("values thousandths at a per-unit cost, in whole Toman", () => {
    expect(valueOf(2_500, 40_000)).toBe(100_000); // 2.5 kg at 40,000/kg
    expect(valueOf(-1_000, 45.5)).toBe(-46);
    expect(valueOf(1_000, 45.5)).toBe(46);
    expect(valueOf(1_000, null)).toBe(0);
    expect(valueOf(1_000, Number.NaN)).toBe(0);
  });
});

describe("purchaseUnitCost", () => {
  it("is the line total over the quantity in item units", () => {
    expect(purchaseUnitCost(900_000, 20_000)).toBe(45_000); // 20 kg for 900,000
    expect(purchaseUnitCost(100, 0)).toBeNull();
  });
});

describe("weightedAverage", () => {
  it("blends what is on hand with what arrived", () => {
    // 10 kg at 40,000 + 10 kg at 50,000 → 45,000
    expect(
      weightedAverage(
        { quantityMilli: 10_000, avgCost: 40_000 },
        { quantityMilli: 10_000, unitCost: 50_000 },
      ),
    ).toBe(45_000);
  });

  it("takes the delivery price when nothing was on hand or the old cost is unknown", () => {
    expect(
      weightedAverage(
        { quantityMilli: -2_000, avgCost: 40_000 },
        { quantityMilli: 5_000, unitCost: 52_000 },
      ),
    ).toBe(52_000);
    expect(
      weightedAverage(
        { quantityMilli: 0, avgCost: 40_000 },
        { quantityMilli: 5_000, unitCost: 52_000 },
      ),
    ).toBe(52_000);
    expect(
      weightedAverage(
        { quantityMilli: 3_000, avgCost: null },
        { quantityMilli: 5_000, unitCost: 52_000 },
      ),
    ).toBe(52_000);
  });
});

describe("effectiveUnitCost", () => {
  const item = { unit: "g", purchasePrice: 45_000, priceUnit: "kg" };
  it("prefers the site average and falls back to the reference price", () => {
    expect(effectiveUnitCost(50, item)).toBe(50);
    expect(effectiveUnitCost(null, item)).toBe(45);
    expect(effectiveUnitCost(undefined, { ...item, purchasePrice: null })).toBeNull();
  });
});

describe("countVariance", () => {
  it("keeps shortage and surplus apart", () => {
    const result = countVariance([
      { itemId: "rice", expectedMilli: 10_000, countedMilli: 8_000, unitCost: 60_000 },
      { itemId: "flour", expectedMilli: 5_000, countedMilli: 6_000, unitCost: 20_000 },
      { itemId: "salt", expectedMilli: 1_000, countedMilli: 1_000, unitCost: 5_000 },
    ]);
    expect(result.shortage).toBe(120_000);
    expect(result.surplus).toBe(20_000);
    expect(result.lines.map((l) => l.deltaMilli)).toEqual([-2_000, 1_000, 0]);
  });
});

describe("inventoryLosses", () => {
  it("reads waste and count differences, and nothing else", () => {
    const losses = inventoryLosses([
      { reason: "WASTE", deltaMilli: -500, unitCost: 80_000 },
      { reason: "STOCKTAKE", deltaMilli: -1_000, unitCost: 30_000 },
      { reason: "STOCKTAKE", deltaMilli: 2_000, unitCost: 10_000 },
      { reason: "PURCHASE", deltaMilli: 10_000, unitCost: 50_000 },
      { reason: "ORDER_PLACED", deltaMilli: -300, unitCost: 50_000 },
    ]);
    expect(losses).toEqual({ waste: 40_000, shortage: 30_000, surplus: 20_000 });
  });
});

describe("waste reasons", () => {
  it("recognises only the listed keys", () => {
    for (const reason of WASTE_REASONS) expect(isWasteReason(reason)).toBe(true);
    expect(isWasteReason("stolen")).toBe(false);
  });
});
