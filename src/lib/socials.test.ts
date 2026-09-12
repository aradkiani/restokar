import { describe, expect, it } from "vitest";
import { MAX_SOCIAL_LINKS, SOCIAL_PLATFORMS, socialHref } from "./socials";

/**
 * `socialHref` takes a string an owner typed and puts the result into an
 * `href` on every guest's phone. The tests that matter are therefore about
 * what it *refuses*, not about the happy path.
 */

describe("socialHref", () => {
  it("turns a bare handle into the platform's own address", () => {
    expect(socialHref({ platform: "instagram", url: "cafenabsh" })).toBe(
      "https://instagram.com/cafenabsh",
    );
    expect(socialHref({ platform: "telegram", url: "cafenabsh" })).toBe(
      "https://t.me/cafenabsh",
    );
  });

  it("accepts the @ people habitually type in front of a handle", () => {
    expect(socialHref({ platform: "instagram", url: "@cafenabsh" })).toBe(
      "https://instagram.com/cafenabsh",
    );
  });

  it("passes a full https address through", () => {
    expect(socialHref({ platform: "website", url: "https://cafe-nabsh.ir/menu" })).toBe(
      "https://cafe-nabsh.ir/menu",
    );
  });

  it("refuses a javascript: URL rather than rendering it as a link", () => {
    // The whole reason this function exists: the value is owner-supplied and
    // ends up in the DOM, so a scheme that executes must never survive.
    expect(socialHref({ platform: "website", url: "javascript:alert(1)" })).toBeNull();
  });

  it("refuses plain http, which a phone browser would warn about anyway", () => {
    expect(socialHref({ platform: "website", url: "http://cafe-nabsh.ir" })).toBeNull();
  });

  it("returns null for an empty or whitespace-only value", () => {
    expect(socialHref({ platform: "instagram", url: "" })).toBeNull();
    expect(socialHref({ platform: "instagram", url: "   " })).toBeNull();
  });

  it("returns null for a platform it does not know", () => {
    // A row written before a platform was retired must not throw on render.
    expect(socialHref({ platform: "myspace" as never, url: "cafenabsh" })).toBeNull();
  });

  it("builds a usable link for every platform it offers", () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const href = socialHref({ platform: platform.id, url: "example" });
      expect(href, platform.id).toMatch(/^https:\/\//);
    }
  });
});

describe("social link cap", () => {
  it("caps at three, which is what the footer row is laid out for", () => {
    expect(MAX_SOCIAL_LINKS).toBe(3);
    // Every offered platform must remain choosable within the cap.
    expect(SOCIAL_PLATFORMS.length).toBeGreaterThanOrEqual(MAX_SOCIAL_LINKS);
  });
});
