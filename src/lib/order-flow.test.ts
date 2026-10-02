import { describe, expect, it } from "vitest";
import { CANCELLABLE, NEXT_STATUS, ORDER_STATUSES, canMoveOrder } from "./order-flow";

describe("order flow", () => {
  it("moves forward one step at a time", () => {
    expect(canMoveOrder("RECEIVED", "PREPARING")).toBe(true);
    expect(canMoveOrder("PREPARING", "READY")).toBe(true);
    expect(canMoveOrder("READY", "DELIVERED")).toBe(true);
  });

  it("never skips or goes back", () => {
    expect(canMoveOrder("RECEIVED", "READY")).toBe(false);
    expect(canMoveOrder("RECEIVED", "DELIVERED")).toBe(false);
    expect(canMoveOrder("READY", "PREPARING")).toBe(false);
    expect(canMoveOrder("DELIVERED", "READY")).toBe(false);
  });

  it("cancels only what has not reached the guest", () => {
    for (const from of ["RECEIVED", "PREPARING", "READY"]) {
      expect(canMoveOrder(from, "CANCELED")).toBe(true);
    }
    expect(canMoveOrder("DELIVERED", "CANCELED")).toBe(false);
  });

  it("never revives a cancelled order", () => {
    for (const to of ORDER_STATUSES) {
      expect(canMoveOrder("CANCELED", to)).toBe(false);
    }
  });

  it("refuses statuses it does not know", () => {
    expect(canMoveOrder("RECEIVED", "LOST")).toBe(false);
    expect(canMoveOrder("LOST", "CANCELED")).toBe(false);
  });

  it("agrees with the board's buttons", () => {
    // The board draws a forward button from NEXT_STATUS and a cancel button for
    // CANCELLABLE; every one of those must be a move the server accepts.
    for (const [from, to] of Object.entries(NEXT_STATUS)) {
      expect(canMoveOrder(from, to!)).toBe(true);
    }
    for (const from of CANCELLABLE) expect(canMoveOrder(from, "CANCELED")).toBe(true);
  });
});
