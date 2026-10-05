import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Sign-in is phone + password; the one-time code is used only to prove a
 * number once — at sign-up, or when activating an account someone else made.
 *
 * Asserted against the source, like the tenant-isolation guards: a code check
 * crept back into sign-in, or an email field, would change who can get in and
 * nothing else in the suite would notice.
 */

const src = fileURLToPath(new URL("../../", import.meta.url));

/**
 * A file's code with its comments removed. The guards are about what the code
 * does, not about what a comment explains.
 */
const read = (path: string) =>
  readFileSync(`${src}${path}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("password sign-in", () => {
  it("signs in with a password and never with a code", () => {
    const login = read("app/api/auth/login/route.ts");
    expect(login).toMatch(/verifyPassword\(/);
    expect(login).not.toMatch(/verifyOtp|requestOtp/);
    expect(login).toMatch(/loginLockedFor\(/);
    expect(login).toMatch(/recordLoginFailure\(/);
    // A missing account is checked against a decoy, so timing reveals nothing.
    expect(login).toMatch(/decoyHash\(\)/);
  });

  it("asks for a code only to prove a number: sign-up and activation", () => {
    const otp = read("app/api/auth/otp/route.ts");
    expect(otp).toMatch(/"SIGNUP"/);
    expect(read("lib/validation.ts")).toMatch(
      /purpose: z\.enum\(\["SIGNUP", "ACTIVATE"\]\)/,
    );
    expect(read("app/api/auth/register/route.ts")).toMatch(/verifyOtp\(/);
    expect(read("app/api/auth/activate/route.ts")).toMatch(/verifyOtp\(/);
  });

  it("never lets activation replace an existing password", () => {
    const activate = read("app/api/auth/activate/route.ts");
    expect(activate).toMatch(/isPasswordHash\(user\.passwordHash\)/);
  });

  it("stores passwords only as hashes", () => {
    for (const path of [
      "app/api/auth/register/route.ts",
      "app/api/auth/activate/route.ts",
      "app/api/account/password/route.ts",
      "app/api/staff/route.ts",
      "app/api/branches/route.ts",
      "app/api/admin/accounts/route.ts",
    ]) {
      const source = read(path);
      expect(source, path).toMatch(/hashPassword\(/);
      // The raw value never reaches the column — only a hash does.
      expect(source, path).not.toMatch(/passwordHash:\s*input\.\w+\s*[,}\n]/);
    }
  });

  it("asks for the current password before changing it", () => {
    const change = read("app/api/account/password/route.ts");
    expect(change).toMatch(/verifyPassword\(input\.currentPassword/);
  });

  it.each([
    "app/api/auth/login/route.ts",
    "app/api/auth/register/route.ts",
    "app/(auth)/login/form.tsx",
    "app/(auth)/register/form.tsx",
  ])("%s knows nothing of emails", (path) => {
    expect(read(path)).not.toMatch(/\bemail\b/i);
  });
});

describe("the code itself", () => {
  const source = read("lib/auth/otp-server.ts");

  /** Printing codes is how development works; in production it is a leak. */
  it("prints a code only outside production", () => {
    const printed = source.indexOf("[otp:dev]");
    const guard = source.lastIndexOf('process.env.NODE_ENV !== "production"', printed);
    expect(printed).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(printed - guard).toBeLessThan(200);
  });

  it("stores a hash of the code, never the code", () => {
    expect(source).toMatch(/codeHash: hashCode\(/);
    expect(source).not.toMatch(/\bcode: code\b|data: \{[^}]*\bcode,/);
  });

  it("compares hashes in constant time", () => {
    expect(source).toContain("timingSafeEqual");
  });
});
