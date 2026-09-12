import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn } from "@/lib/theme";
import { getTemplateMeta, isTemplateId, TEMPLATES } from "../registry";

/**
 * Contrast floors for Vitrin's default palette.
 *
 * This template gives one photograph most of the screen and puts every label on
 * top of it, so its palette does more work than any other in the catalogue —
 * and it is the only one that ships a near-black background with a high-chroma
 * accent, which is exactly the combination that reads as bold in a swatch and
 * fails as body text. The ratios are asserted rather than eyeballed.
 *
 * `scripts/audit-palettes.ts` covers `src/lib/palettes.ts`, which is the set of
 * colour presets an owner can pick — a different list that never included
 * template defaults.
 */

const VITRIN = getTemplateMeta("vitrin").defaultTheme;

describe("vitrin default theme", () => {
  const text = VITRIN.text!;
  const surface = VITRIN.surface!;
  const background = VITRIN.background!;
  const muted = VITRIN.muted!;
  const primary = VITRIN.primary!;

  it("is registered and resolvable by id", () => {
    expect(isTemplateId("vitrin")).toBe(true);
    expect(getTemplateMeta("vitrin").id).toBe("vitrin");
  });

  it("puts body text well past AA on both surfaces", () => {
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted text readable rather than merely dimmer", () => {
    // Secondary text is still text. The templates lean on `opacity` for
    // de-emphasis, so the base colour has to start with headroom.
    expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the accent legible where it is used as text", () => {
    // The active category label is drawn in `--m-primary` directly on the
    // background, which is the one place the accent has to behave like text.
    expect(contrastRatio(primary, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("derives a readable label for the add-to-cart button", () => {
    // `readableOn` picks the button's foreground; on an acid-lime primary that
    // must resolve to the dark option, not white.
    expect(contrastRatio(readableOn(primary), primary)).toBeGreaterThanOrEqual(4.5);
  });

  it("is a dark theme, and a different one from Noir", () => {
    const noir = getTemplateMeta("noir").defaultTheme;
    expect(contrastRatio(background, "#ffffff")).toBeGreaterThan(
      contrastRatio(background, "#000000"),
    );
    expect(primary).not.toBe(noir.primary);
    expect(background).not.toBe(noir.background);
  });
});

describe("template registry", () => {
  it("has no duplicate ids", () => {
    const ids = TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every template a three-colour swatch of real hex values", () => {
    for (const template of TEMPLATES) {
      expect(template.swatch, template.id).toHaveLength(3);
      for (const colour of template.swatch) {
        expect(colour, `${template.id} swatch`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("names every template in both languages", () => {
    for (const template of TEMPLATES) {
      expect(template.nameFa.trim(), template.id).not.toBe("");
      expect(template.nameEn.trim(), template.id).not.toBe("");
      expect(template.descriptionFa.trim(), template.id).not.toBe("");
      expect(template.descriptionEn.trim(), template.id).not.toBe("");
    }
  });

  it("falls back to the default template for an unknown id", () => {
    // A retired template must degrade to something renderable rather than
    // leaving a paying customer with a blank menu.
    expect(getTemplateMeta("no-such-template").id).toBe("aurora");
    expect(getTemplateMeta(null).id).toBe("aurora");
  });
});
