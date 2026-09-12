import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  parseTheme,
  readableOn,
  resolveTheme,
  themeToCssVars,
} from "./theme";
import { PALETTES, auditAllPalettes } from "./palettes";

/**
 * Themes are owner-supplied data rendered on a public page, so these tests
 * cover two risks: an unreadable menu, and a malformed value taking a live
 * menu down.
 */

describe("readableOn", () => {
  it("picks white on dark and black on light", () => {
    expect(readableOn("#0c0a09")).toBe("#ffffff");
    expect(readableOn("#faf7f2")).toBe("#111111");
  });

  it("always returns a label that clears WCAG AA against its background", () => {
    for (const background of [
      "#c2410c",
      "#a16207",
      "#4d7c0f",
      "#9f1239",
      "#1e293b",
      "#ffffff",
    ]) {
      expect(contrastRatio(background, readableOn(background))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});

describe("parseTheme", () => {
  it("keeps valid tokens", () => {
    expect(parseTheme({ primary: "#ff0000", radius: 8 })).toEqual({
      primary: "#ff0000",
      radius: 8,
    });
  });

  it("drops only the invalid token, not the whole theme", () => {
    // A single bad value must not reset a restaurant's entire colour scheme.
    const parsed = parseTheme({ primary: "#00ff00", secondary: "not-a-colour" });
    expect(parsed.primary).toBe("#00ff00");
    expect(parsed.secondary).toBeUndefined();
  });

  it("rejects a background image that is not a same-origin upload or https URL", () => {
    // Unsanitised CSS values would let an owner inject declarations.
    expect(
      parseTheme({ backgroundImage: "url(x);background:red" }).backgroundImage,
    ).toBeUndefined();
    expect(
      parseTheme({ backgroundImage: "javascript:alert(1)" }).backgroundImage,
    ).toBeUndefined();
    expect(parseTheme({ backgroundImage: "/uploads/a.jpg" }).backgroundImage).toBe(
      "/uploads/a.jpg",
    );
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, "string", 42, [], { radius: "big" }]) {
      expect(() => parseTheme(junk)).not.toThrow();
    }
  });
});

describe("resolveTheme", () => {
  it("layers owner overrides on top of the template default", () => {
    const resolved = resolveTheme(
      { primary: "#123456" },
      { primary: "#000000", radius: 4 },
    );
    expect(resolved.primary).toBe("#123456");
    expect(resolved.radius).toBe(4);
  });

  it("always produces a complete theme", () => {
    const resolved = resolveTheme({});
    for (const key of [
      "primary",
      "secondary",
      "background",
      "surface",
      "text",
      "muted",
      "font",
    ]) {
      expect(resolved[key as keyof typeof resolved]).toBeDefined();
    }
  });
});

describe("themeToCssVars", () => {
  it("emits a font stack and contrast-safe pairs for every surface style", () => {
    for (const surfaceStyle of ["flat", "glass", "elevated"] as const) {
      const vars = themeToCssVars(resolveTheme({ surfaceStyle }));
      expect(vars["--m-surface-bg"]).toBeTruthy();
      expect(vars["--m-font"]).toContain("Vazirmatn");
      expect(vars["--m-primary-contrast"]).toMatch(/^#(ffffff|111111)$/);
    }
  });
});

describe("palettes", () => {
  it("every shipped palette passes WCAG AA", () => {
    for (const audit of auditAllPalettes()) {
      expect(audit.passes, `palette "${audit.id}" fails contrast`).toBe(true);
    }
  });

  it("palette ids are unique", () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
