import { describe, expect, it } from "vitest";
import {
  containsLink,
  DEFAULT_OPT_OUT_SUFFIX,
  detectEncoding,
  estimateCost,
  promoTextIssue,
  variablesContainLink,
  withOptOutSuffix,
} from "./text";

describe("detectEncoding", () => {
  it("treats plain Latin as GSM-7", () => {
    expect(detectEncoding("Order 42 is ready")).toBe("GSM7");
  });

  it("treats Persian as UCS-2", () => {
    expect(detectEncoding("سفارش شما آماده است")).toBe("UCS2");
  });

  /**
   * The case that surprises people: one Persian character in an otherwise Latin
   * message forces the whole thing to UCS-2 and more than halves the budget.
   */
  it("forces UCS-2 for a single non-GSM character in a Latin message", () => {
    expect(detectEncoding("Order 42 ready ✓")).toBe("UCS2");
    expect(detectEncoding("Order 42 آماده")).toBe("UCS2");
  });
});

describe("estimateCost", () => {
  it("counts a short Latin message as one part", () => {
    const cost = estimateCost("Your order is ready");
    expect(cost).toMatchObject({ encoding: "GSM7", parts: 1 });
  });

  it("splits Latin at 160 then 153 per part", () => {
    expect(estimateCost("a".repeat(160)).parts).toBe(1);
    expect(estimateCost("a".repeat(161)).parts).toBe(2);
    expect(estimateCost("a".repeat(306)).parts).toBe(2);
    expect(estimateCost("a".repeat(307)).parts).toBe(3);
  });

  /**
   * The number that decides what a campaign costs. A 400-recipient announcement
   * of 71 Persian characters is 800 messages, not 400.
   */
  it("splits Persian at 70 then 67 per part", () => {
    expect(estimateCost("ا".repeat(70)).parts).toBe(1);
    expect(estimateCost("ا".repeat(71)).parts).toBe(2);
    expect(estimateCost("ا".repeat(134)).parts).toBe(2);
    expect(estimateCost("ا".repeat(135)).parts).toBe(3);
  });

  it("charges nothing for an empty text", () => {
    expect(estimateCost("").parts).toBe(0);
  });

  /** `.length` would count an emoji as two and overstate the bill. */
  it("counts code points rather than UTF-16 units", () => {
    expect(estimateCost("😀").characters).toBe(1);
  });
});

describe("containsLink", () => {
  it("catches an explicit scheme", () => {
    expect(containsLink("سفارش خود را ببینید https://restokar.ir/x")).toBe(true);
    expect(containsLink("ftp://example.org")).toBe(true);
  });

  it("catches a www host and a bare domain", () => {
    expect(containsLink("www.restokar.ir")).toBe(true);
    expect(containsLink("به restokar.ir سر بزنید")).toBe(true);
  });

  it("does not flag ordinary Persian marketing copy", () => {
    expect(containsLink("سفارش شما آماده است. نوش جان!")).toBe(false);
    expect(containsLink("تخفیف ۲۰٪ تا پایان هفته")).toBe(false);
  });

  /** SendByBaseNumber returns -10 for a link in a variable, naming no field. */
  it("checks pattern variables so the offending value can be named", () => {
    expect(variablesContainLink(["برگرخانه آتش", "42"])).toBe(false);
    expect(variablesContainLink(["برگرخانه", "restokar.ir"])).toBe(true);
  });
});

describe("withOptOutSuffix", () => {
  it("appends the suffix that keeps a promotional send from being refused", () => {
    expect(withOptOutSuffix("تخفیف ویژه امروز")).toBe(
      `تخفیف ویژه امروز\n${DEFAULT_OPT_OUT_SUFFIX}`,
    );
  });

  /** «لغو11 لغو11» reads as a bug to every recipient. */
  it("does not add a second copy when one is already present", () => {
    const once = withOptOutSuffix("تخفیف ویژه");
    expect(withOptOutSuffix(once)).toBe(once);
  });

  it("leaves a suffix written mid-text alone", () => {
    const text = "تخفیف ویژه\nلغو11\nرستوران ما";
    expect(withOptOutSuffix(text)).toBe(text);
  });

  it("accepts a configured alternative", () => {
    expect(withOptOutSuffix("سلام", "لغو۱۱")).toBe("سلام\nلغو۱۱");
  });

  it("adds nothing when the suffix is configured empty", () => {
    expect(withOptOutSuffix("سلام", "")).toBe("سلام");
  });
});

describe("promoTextIssue", () => {
  it("passes ordinary copy", () => {
    expect(promoTextIssue("تخفیف ۲۰٪ تا پایان هفته")).toBeNull();
  });

  it("refuses an empty text before it costs a call", () => {
    expect(promoTextIssue("")).toBe("EMPTY");
    expect(promoTextIssue("   ")).toBe("EMPTY");
  });

  it("refuses a link, which the provider rejects for everybody at once", () => {
    expect(promoTextIssue("ببینید restokar.ir")).toBe("CONTAINS_LINK");
  });
});
