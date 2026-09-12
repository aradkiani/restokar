import { describe, expect, it } from "vitest";
import { featureEnabled } from "./features";

/**
 * Payments and public signup are switched off while there is no gateway.
 *
 * The switch defaults to *off* and has to be turned on explicitly. That
 * direction matters: a deployment that forgets to set the variable must end up
 * with checkout disabled, not with a checkout that takes money the platform
 * cannot process.
 */

describe("featureEnabled", () => {
  it("is off when the variable is unset", () => {
    expect(featureEnabled(undefined)).toBe(false);
  });

  it("is off for an empty or whitespace value", () => {
    expect(featureEnabled("")).toBe(false);
    expect(featureEnabled("   ")).toBe(false);
  });

  it("is on only for an explicit true", () => {
    expect(featureEnabled("true")).toBe(true);
    expect(featureEnabled("1")).toBe(true);
  });

  it("tolerates the casing and padding a .env file picks up", () => {
    expect(featureEnabled(" TRUE ")).toBe(true);
    expect(featureEnabled("True")).toBe(true);
  });

  it("treats anything else as off rather than guessing", () => {
    // "yes", "on" and "enabled" all read as intent to enable, but accepting
    // them means a typo like "ture" also has to be decided — and the safe
    // answer for a payment switch is always off.
    for (const value of ["false", "0", "no", "off", "yes", "on", "ture"]) {
      expect(featureEnabled(value), value).toBe(false);
    }
  });
});
