import { describe, expect, it } from "vitest";
import {
  groupTabs,
  mergeBillLines,
  normaliseTable,
  sumBill,
  type TabOrder,
} from "./table-tab";

let n = 0;
function order(patch: Partial<TabOrder>): TabOrder {
  n += 1;
  return {
    id: `o${n}`,
    orderNumber: n,
    tableNumber: "7",
    paymentMethod: "CASH_ON_SITE",
    paymentStatus: "PENDING",
    status: "DELIVERED",
    placedAt: new Date(2026, 9, 4, 12, n),
    subtotal: 100_000,
    discount: 0,
    serviceCharge: 0,
    tax: 0,
    tip: 0,
    roundingAdjustment: 0,
    total: 100_000,
    items: [{ name: "چای", quantity: 1, lineTotal: 100_000, options: [] }],
    ...patch,
  };
}

describe("table tabs", () => {
  it("treats Persian and Latin digits as the same table", () => {
    expect(normaliseTable(" ۷ ")).toBe("7");
  });

  it("gathers a table's open rounds and leaves paid or cancelled ones out", () => {
    const tabs = groupTabs([
      order({ tableNumber: "7" }),
      order({ tableNumber: "۷", total: 50_000 }),
      order({ tableNumber: "7", paymentStatus: "PAID" }),
      order({ tableNumber: "7", status: "CANCELED" }),
      order({ tableNumber: "3" }),
    ]);
    expect(tabs.map((tab) => tab.table)).toEqual(["7", "3"]);
    expect(tabs[0]!.orders).toHaveLength(2);
    expect(tabs[0]!.total).toBe(150_000);
  });

  it("marks the tables whose guests asked for the bill", () => {
    const tabs = groupTabs([order({ tableNumber: "4" })], new Set(["4"]));
    expect(tabs[0]!.billRequested).toBe(true);
  });

  it("merges the same dish across rounds, but not across prices", () => {
    const lines = mergeBillLines([
      order({ items: [{ name: "چای", quantity: 2, lineTotal: 60_000, options: [] }] }),
      order({ items: [{ name: "چای", quantity: 1, lineTotal: 30_000, options: [] }] }),
      order({ items: [{ name: "چای", quantity: 1, lineTotal: 35_000, options: [] }] }),
      order({
        items: [{ name: "چای", quantity: 1, lineTotal: 30_000, options: ["بزرگ"] }],
      }),
    ]);
    expect(lines).toEqual([
      { name: "چای", options: [], quantity: 3, lineTotal: 90_000 },
      { name: "چای", options: [], quantity: 1, lineTotal: 35_000 },
      { name: "چای", options: ["بزرگ"], quantity: 1, lineTotal: 30_000 },
    ]);
  });

  it("adds up each order's own figures", () => {
    const totals = sumBill([
      order({ subtotal: 100, tax: 9, tip: 5, total: 114 }),
      order({ subtotal: 200, discount: 20, serviceCharge: 10, total: 190 }),
    ]);
    expect(totals).toEqual({
      subtotal: 300,
      discount: 20,
      serviceCharge: 10,
      tax: 9,
      tip: 5,
      roundingAdjustment: 0,
      total: 304,
    });
  });
});
