import { describe, expect, it } from "vitest";
import { AdminAccountSchema } from "./validation";
import { addMonths, subscriptionEndFromDays } from "./onboarding";
import { MAX_ONBOARDING_DAYS, MIN_ONBOARDING_DAYS } from "./constants";

/**
 * Manual onboarding stands in for the payment gateway: platform staff create
 * the account and hand over a password, so the rules that billing would have
 * enforced now have to be enforced here instead.
 */

describe("subscriptionEndFromDays", () => {
  const from = new Date("2026-03-01T09:00:00.000Z");

  it("ends the subscription the given number of days after the start", () => {
    expect(subscriptionEndFromDays(30, from).toISOString()).toBe(
      "2026-03-31T09:00:00.000Z",
    );
  });

  it("keeps the time of day, so a period never expires earlier than granted", () => {
    // Truncating to midnight would silently shorten every subscription by up
    // to a day — the kind of thing a customer notices and staff cannot explain.
    const end = subscriptionEndFromDays(1, from);
    expect(end.toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("counts a year correctly across a leap day", () => {
    const beforeLeap = new Date("2028-02-01T00:00:00.000Z");
    expect(subscriptionEndFromDays(365, beforeLeap).toISOString()).toBe(
      "2029-01-31T00:00:00.000Z",
    );
  });

  it("never returns a date in the past for a valid duration", () => {
    const now = new Date();
    expect(subscriptionEndFromDays(MIN_ONBOARDING_DAYS, now).getTime()).toBeGreaterThan(
      now.getTime(),
    );
  });
});

/**
 * Gateway-settled renewals extend by whole calendar months, which is where
 * JavaScript's own date arithmetic quietly does the wrong thing.
 */
describe("addMonths", () => {
  it("clamps 31 January to the end of February instead of overflowing", () => {
    // `setMonth(getMonth() + 1)` gives 3 March here: 31 February rolls forward.
    // The customer would be billed for a period ending two days after the one
    // they bought, and the error compounds on every long-month renewal.
    const end = addMonths(new Date("2026-01-31T12:00:00.000Z"), 1);
    expect(end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("clamps to 29 February in a leap year", () => {
    const end = addMonths(new Date("2028-01-31T12:00:00.000Z"), 1);
    expect(end.toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("keeps the day of month when the target month is long enough", () => {
    const end = addMonths(new Date("2026-03-15T12:00:00.000Z"), 1);
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("rolls the year over for a twelve-month term", () => {
    const end = addMonths(new Date("2026-06-30T12:00:00.000Z"), 12);
    expect(end.toISOString().slice(0, 10)).toBe("2027-06-30");
  });

  it("clamps 31 August to 30 September rather than 1 October", () => {
    const end = addMonths(new Date("2026-08-31T12:00:00.000Z"), 1);
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("preserves the time of day", () => {
    const end = addMonths(new Date("2026-01-31T09:30:00.000Z"), 1);
    expect(end.toISOString().slice(11, 19)).toBe("09:30:00");
  });
});

describe("AdminAccountSchema", () => {
  const valid = {
    email: "owner@cafe.ir",
    password: "a-real-password",
    ownerName: "سارا",
    restaurantName: "کافه نمونه",
    slug: "cafe-nemune",
    planCode: "pro",
    durationDays: 30,
  };

  it("accepts a complete account request", () => {
    expect(AdminAccountSchema.safeParse(valid).success).toBe(true);
  });

  it("normalises the email so one person cannot hold two accounts", () => {
    const parsed = AdminAccountSchema.parse({ ...valid, email: "  Owner@Cafe.IR " });
    expect(parsed.email).toBe("owner@cafe.ir");
  });

  it("rejects a password short enough to guess", () => {
    // Staff pick these by hand and will reach for something short unless stopped.
    expect(AdminAccountSchema.safeParse({ ...valid, password: "short" }).success).toBe(
      false,
    );
  });

  it("rejects a reserved slug that would shadow a real route", () => {
    expect(AdminAccountSchema.safeParse({ ...valid, slug: "admin" }).success).toBe(false);
  });

  it("rejects a duration outside the permitted range", () => {
    expect(AdminAccountSchema.safeParse({ ...valid, durationDays: 0 }).success).toBe(
      false,
    );
    expect(
      AdminAccountSchema.safeParse({
        ...valid,
        durationDays: MAX_ONBOARDING_DAYS + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a fractional duration rather than rounding it", () => {
    expect(AdminAccountSchema.safeParse({ ...valid, durationDays: 30.5 }).success).toBe(
      false,
    );
  });
});
