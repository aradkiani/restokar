import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Sign-in is phone + one-time code, and nothing else.
 *
 * Asserted against the source, like the tenant-isolation guards: an email field
 * or a password check added back to a sign-in path would quietly reopen the way
 * in that phone sign-in closed, and nothing else in the suite would notice.
 */

const src = fileURLToPath(new URL("../../", import.meta.url));

/**
 * A file's code with its comments removed. The guards are about what the code
 * does; a comment explaining that there is no password is not a password.
 */
const read = (path: string) =>
  readFileSync(`${src}${path}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const SIGN_IN_PATHS = [
  "app/api/auth/login/route.ts",
  "app/api/auth/register/route.ts",
  "app/api/auth/otp/route.ts",
  "app/api/account/phone/route.ts",
  "app/(auth)/login/form.tsx",
  "app/(auth)/register/form.tsx",
  "components/auth/code-step.tsx",
  "components/auth/phone-change-card.tsx",
];

describe("phone-only sign-in", () => {
  it.each(SIGN_IN_PATHS)("%s knows nothing of emails or passwords", (path) => {
    expect(read(path)).not.toMatch(/\bemail\b|\bpassword/i);
  });

  it("has no password endpoint and no password helper", () => {
    expect(existsSync(`${src}app/api/account/password/route.ts`)).toBe(false);
    expect(existsSync(`${src}lib/auth/password.ts`)).toBe(false);
  });

  it("creates accounts by phone wherever someone else creates them", () => {
    for (const path of [
      "app/api/staff/route.ts",
      "app/api/branches/route.ts",
      "app/api/admin/accounts/route.ts",
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/passwordHash|bcrypt|email:/);
      expect(source, path).toMatch(/phone:/);
    }
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
