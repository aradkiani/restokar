import { describe, expect, it } from "vitest";
import { clip, fingerprintOf, maskPath, scrubText } from "./error-shape";

describe("maskPath", () => {
  it("drops the query and masks tokens and long numbers", () => {
    expect(maskPath("/menu/narenj/order/Xk3pQ9vLm2Rt7Yw1zA?x=1")).toBe(
      "/menu/narenj/order/:id",
    );
    expect(maskPath("/print/order/cmuu8pxjb0002tsufozgeviue?kind=bill")).toBe(
      "/print/order/:id",
    );
    expect(maskPath("/dashboard/orders/123456")).toBe("/dashboard/orders/:id");
    expect(maskPath("/dashboard/inventory")).toBe("/dashboard/inventory");
    expect(maskPath("")).toBeNull();
    expect(maskPath(null)).toBeNull();
  });
});

describe("scrubText", () => {
  it("blanks long digit runs that could be a phone or a card", () => {
    expect(scrubText("failed for 09121234567 at step 3")).toBe(
      "failed for ########### at step 3",
    );
    expect(scrubText("order 42")).toBe("order 42");
  });
});

describe("clip", () => {
  it("bounds a long text", () => {
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abc", 4)).toBe("abc");
    expect(clip(null, 4)).toBeNull();
  });
});

describe("fingerprintOf", () => {
  it("groups the same error with different numbers, separates different places", () => {
    const one = fingerprintOf({
      source: "SERVER",
      message: "order 12 failed",
      path: "/a",
    });
    const two = fingerprintOf({
      source: "SERVER",
      message: "order 13 failed",
      path: "/a",
    });
    const elsewhere = fingerprintOf({
      source: "SERVER",
      message: "order 12 failed",
      path: "/b",
    });
    const client = fingerprintOf({
      source: "CLIENT",
      message: "order 12 failed",
      path: "/a",
    });
    expect(one).toBe(two);
    expect(one).not.toBe(elsewhere);
    expect(one).not.toBe(client);
    expect(one).toMatch(/^[0-9a-f]{16}$/);
  });
});
