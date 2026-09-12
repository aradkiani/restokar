import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_OPTIONS, ThemeSchema, resolveTheme, themeToCssVars } from "./theme";

/**
 * Guards the failure mode that shipped once already: `estedad` was offered in
 * the font picker and named in the CSS stack, but no font file and no
 * `@font-face` existed, so choosing it silently rendered Tahoma. An owner who
 * picks a font and sees nothing change has no way to tell a broken option from
 * a subtle one.
 *
 * These tests read the real stylesheet and the real public/ directory, so
 * adding a font to the catalogue without shipping its file fails here rather
 * than on a customer's menu.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const CSS = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");

/*
  Every catalogue entry is now self-hosted. The list used to be filtered to
  drop `system`, which named no family of ours and so had no file to check;
  retiring it means the checks below apply to all of them without exception.
*/

describe("font catalogue", () => {
  it("offers more than one real face", () => {
    expect(FONT_OPTIONS.length).toBeGreaterThan(1);
  });

  it("has a unique id and both labels for every option", () => {
    const ids = FONT_OPTIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const font of FONT_OPTIONS) {
      expect(font.labelFa.trim().length).toBeGreaterThan(0);
      expect(font.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("accepts every catalogue id, and rejects one that is not there", () => {
    for (const font of FONT_OPTIONS) {
      expect(ThemeSchema.safeParse({ font: font.id }).success).toBe(true);
    }
    expect(ThemeSchema.safeParse({ font: "comic-sans" }).success).toBe(false);
  });
});

describe.each(FONT_OPTIONS)("$labelEn", (font) => {
  const stack = themeToCssVars(resolveTheme({ font: font.id }))["--m-font"];

  it("leads its own stack rather than another family's", () => {
    expect(stack.toLowerCase()).toContain(font.labelEn.toLowerCase());
    expect(stack.trim().toLowerCase().startsWith(`"${font.labelEn.toLowerCase()}"`)).toBe(
      true,
    );
  });

  it("declares an @font-face", () => {
    expect(CSS).toContain(`font-family: "${font.labelEn}"`);
  });

  it("ships every file that @font-face points at", () => {
    // Pull the urls out of the block belonging to this family.
    const block = CSS.split("@font-face")
      .filter((b) => b.includes(`font-family: "${font.labelEn}"`))
      .join("\n");

    const urls = [...block.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      expect(existsSync(join(ROOT, "public", url))).toBe(true);
    }
  });
});

/**
 * `system` was retired from the catalogue. It resolved to whatever face the
 * guest's device happened to ship, so a single menu rendered in a different
 * typeface on every phone and the owner could not see what they were shipping
 * — the Estedad complaint above, in a form no font file could fix.
 *
 * No migration was written for venues that had already stored it. These two
 * assertions are the reason none is needed.
 */
describe("the retired system font", () => {
  it("is no longer accepted as a stored value", () => {
    expect(ThemeSchema.safeParse({ font: "system" }).success).toBe(false);
  });

  it("falls back to the default face instead of leaving the menu unstyled", () => {
    // parseTheme validates per key, so the stale value is dropped and
    // BASE_THEME supplies the font — the whole colour scheme survives.
    const stack = themeToCssVars(resolveTheme({ font: "system" }))["--m-font"];
    expect(stack.startsWith('"Vazirmatn"')).toBe(true);
  });
});
