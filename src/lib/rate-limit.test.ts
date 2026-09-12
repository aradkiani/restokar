import { describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

/**
 * Which address a request is counted against.
 *
 * This is the whole basis of every per-IP limit in the app — login, order
 * placement, staff calls — so getting it wrong does not fail loudly, it just
 * means the limits quietly stop applying.
 */

function request(headers: Record<string, string>): Request {
  return new Request("https://menuland.ir/api/auth/login", { headers });
}

describe("clientIp", () => {
  it("reads the rightmost entry, which the client cannot forge", () => {
    // nginx's `proxy_add_x_forwarded_for` APPENDS its view of the peer to
    // whatever the client sent. With one proxy in front, the last entry is the
    // real address and everything left of it is attacker-supplied.
    expect(clientIp(request({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("ignores a spoofed leading entry", () => {
    // Reading the leftmost entry — the previous behaviour — let every request
    // present a fresh identity, so no per-IP limit applied at all.
    const spoofed = request({
      "x-forwarded-for": "attacker-chosen-value, 198.51.100.4",
    });
    expect(clientIp(spoofed)).not.toBe("attacker-chosen-value");
    expect(clientIp(spoofed)).toBe("198.51.100.4");
  });

  it("handles a single-entry header", () => {
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("trims whitespace around entries", () => {
    expect(clientIp(request({ "x-forwarded-for": "1.1.1.1 ,  203.0.113.9  " }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to x-real-ip when there is no forwarding chain", () => {
    expect(clientIp(request({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("returns a stable placeholder rather than throwing when nothing is present", () => {
    // Every caller uses this to build a bucket key, so it must always produce
    // a string — one shared "unknown" bucket is the correct conservative answer.
    expect(clientIp(request({}))).toBe("unknown");
  });

  it("ignores an empty or comma-only header", () => {
    expect(clientIp(request({ "x-forwarded-for": "", "x-real-ip": "203.0.113.5" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIp(request({ "x-forwarded-for": " , , " }))).toBe("unknown");
  });
});
