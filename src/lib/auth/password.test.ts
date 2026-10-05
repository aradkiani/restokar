import { describe, expect, it } from "vitest";
import {
  PASSWORD_MESSAGES,
  hashPassword,
  isPasswordHash,
  passwordProblem,
  verifyPassword,
} from "./password";

describe("passwordProblem", () => {
  it("accepts a reasonable password, Persian letters included", () => {
    expect(passwordProblem("kafe1405")).toBeNull();
    expect(passwordProblem("نارنج۱۴۰۵")).toBeNull();
  });

  it("explains what is wrong", () => {
    expect(passwordProblem("ab12")).toBe("TOO_SHORT");
    expect(passwordProblem("a1".repeat(70))).toBe("TOO_LONG");
    expect(passwordProblem("12345679")).toBe("NEEDS_LETTER");
    expect(passwordProblem("abcdefgh")).toBe("NEEDS_DIGIT");
    expect(passwordProblem("Password123")).toBe("TOO_COMMON");
    expect(passwordProblem("x09121234567", { phone: "09121234567" })).toBe("IS_PHONE");
    expect(passwordProblem("x9121234567y", { phone: "09121234567" })).toBe("IS_PHONE");
  });

  it("has a message for every problem", () => {
    for (const message of Object.values(PASSWORD_MESSAGES)) expect(message).toBeTruthy();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips, salts every hash and refuses a wrong password", async () => {
    const a = await hashPassword("kafe1405");
    const b = await hashPassword("kafe1405");
    expect(isPasswordHash(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(await verifyPassword("kafe1405", a)).toBe(true);
    expect(await verifyPassword("kafe1406", a)).toBe(false);
  });

  it("treats Persian and English digits as the same password", async () => {
    const stored = await hashPassword("kafe1405");
    expect(await verifyPassword("kafe۱۴۰۵", stored)).toBe(true);
  });

  it("is false, never a throw, for anything malformed or legacy", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "$2b$10$legacybcrypthashvalue")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc$8$1$salt$key")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$c2FsdA==$")).toBe(false);
  });
});
