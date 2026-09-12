import { describe, expect, it } from "vitest";
import { normalisePhone } from "./phone";

describe("normalisePhone", () => {
  it("returns null for nothing typed", () => {
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("   ")).toBeNull();
  });

  /**
   * The reason this module exists: every spelling below is the same customer,
   * and each one is what a real guest types. If any of these disagreed, that
   * person would appear in the venue's records as several different people.
   */
  it("collapses every spelling of one mobile onto a single form", () => {
    const forms = [
      "09121234567",
      "9121234567",
      "+989121234567",
      "0098 912 123 4567",
      "98-912-123-4567",
      "0912 123 4567",
      "(0912) 123-4567",
      "۰۹۱۲۱۲۳۴۵۶۷", // Persian digits
      "٠٩١٢١٢٣٤٥٦٧", // Arabic-Indic digits
      "  09121234567  ",
    ];

    for (const form of forms) {
      expect(normalisePhone(form), form).toBe("09121234567");
    }

    expect(new Set(forms.map(normalisePhone)).size).toBe(1);
  });

  it("is idempotent — normalising twice changes nothing", () => {
    const once = normalisePhone("+98 912 123 4567");
    expect(normalisePhone(once)).toBe(once);
  });

  it("keeps every mobile operator prefix distinct", () => {
    expect(normalisePhone("09351112233")).toBe("09351112233");
    expect(normalisePhone("09011112233")).toBe("09011112233");
    expect(normalisePhone("09901112233")).toBe("09901112233");
  });

  /**
   * A landline is a legitimate contact number whose area-code conventions this
   * function does not model. Cleaning the separators is safe; inventing a
   * mobile prefix for it would corrupt the only way to reach the guest.
   */
  it("cleans but does not reshape a landline", () => {
    expect(normalisePhone("021-8877 6655")).toBe("02188776655");
    expect(normalisePhone("۰۲۱ ۸۸۷۷۶۶۵۵")).toBe("02188776655");
  });

  it("leaves a foreign number recognisable", () => {
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("never exceeds what the column accepts", () => {
    expect(normalisePhone("1".repeat(60))!.length).toBeLessThanOrEqual(20);
  });

  it("does not throw on input that is not a number at all", () => {
    expect(() => normalisePhone("تماس بگیرید")).not.toThrow();
    expect(normalisePhone("تماس بگیرید")).toBe("تماسبگیرید");
  });
});
