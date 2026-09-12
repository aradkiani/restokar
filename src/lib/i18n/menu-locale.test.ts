import { describe, expect, it } from "vitest";
import {
  menuLocaleCookiePath,
  otherLocale,
  resolveMenuLocale,
  type MenuLocaleInput,
} from "./menu-locale";

/**
 * These rules are the fix for a real, reported bug: an owner set their menu
 * language to English, nothing changed, and the cause was a platform-wide
 * cookie quietly outranking the venue's own setting. The precedence below is
 * pinned so that cannot come back.
 */

const MONO: MenuLocaleInput = { bilingualEnabled: false };
const BILINGUAL: MenuLocaleInput = { bilingualEnabled: true };

describe("a venue that does not offer a second language", () => {
  it("renders in its own chosen language", () => {
    expect(resolveMenuLocale({ ...MONO, venueDefault: "en" })).toBe("en");
    expect(resolveMenuLocale({ ...MONO, venueDefault: "fa" })).toBe("fa");
  });

  it("ignores a stale guest cookie — the regression that started all this", () => {
    expect(resolveMenuLocale({ ...MONO, venueDefault: "en", guestChoice: "fa" })).toBe(
      "en",
    );
  });

  it("ignores ?lang=, so a shared link cannot override the owner", () => {
    expect(resolveMenuLocale({ ...MONO, venueDefault: "fa", requested: "en" })).toBe(
      "fa",
    );
  });

  it("falls back to Persian when the venue default is missing or junk", () => {
    expect(resolveMenuLocale({ ...MONO })).toBe("fa");
    expect(resolveMenuLocale({ ...MONO, venueDefault: "de" })).toBe("fa");
    expect(resolveMenuLocale({ ...MONO, venueDefault: null })).toBe("fa");
  });
});

describe("a bilingual venue", () => {
  it("opens in the venue's default when the guest has no preference", () => {
    expect(resolveMenuLocale({ ...BILINGUAL, venueDefault: "en" })).toBe("en");
    expect(resolveMenuLocale({ ...BILINGUAL, venueDefault: "fa" })).toBe("fa");
  });

  it("honours the guest's remembered choice over the venue default", () => {
    expect(
      resolveMenuLocale({ ...BILINGUAL, venueDefault: "fa", guestChoice: "en" }),
    ).toBe("en");
  });

  it("lets an explicit ?lang= win over everything", () => {
    expect(
      resolveMenuLocale({
        ...BILINGUAL,
        venueDefault: "fa",
        guestChoice: "fa",
        requested: "en",
      }),
    ).toBe("en");
  });

  it("skips an unsupported ?lang= rather than failing", () => {
    expect(resolveMenuLocale({ ...BILINGUAL, venueDefault: "fa", requested: "de" })).toBe(
      "fa",
    );
  });
});

describe("cookie path", () => {
  it("scopes the choice to one venue", () => {
    expect(menuLocaleCookiePath("burger-lab")).toBe("/menu/burger-lab");
  });

  /**
   * A Persian slug reaches the browser percent-encoded, and a cookie whose path
   * does not match that encoded form is simply never sent back — the guest's
   * choice would appear not to stick.
   */
  it("encodes a Persian slug the way the URL does", () => {
    expect(menuLocaleCookiePath("سنتی-حشمت")).toBe(
      `/menu/${encodeURIComponent("سنتی-حشمت")}`,
    );
    expect(menuLocaleCookiePath("سنتی-حشمت")).not.toContain("سنتی");
  });
});

describe("otherLocale", () => {
  it("is its own inverse", () => {
    expect(otherLocale("fa")).toBe("en");
    expect(otherLocale("en")).toBe("fa");
    expect(otherLocale(otherLocale("fa"))).toBe("fa");
  });
});
