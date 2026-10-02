import { describe, expect, it } from "vitest";
import { fa } from "../i18n/fa";
import { en } from "../i18n/en";
import {
  DOCUMENTS,
  announcementLive,
  getDocumentDef,
  pick,
  resolveDocument,
  validateDocument,
} from "./schema";

const home = getDocumentDef("home")!;
const site = getDocumentDef("site")!;
const faq = getDocumentDef("faq")!;

describe("content schema", () => {
  it("gives every document a unique key and every field a default", () => {
    const keys = DOCUMENTS.map((doc) => doc.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const doc of DOCUMENTS) {
      for (const field of doc.fields) expect(field).toHaveProperty("default");
    }
  });

  it("renders today's exact text from an empty database", () => {
    const values = resolveDocument(home, null);
    expect(pick(values.heroTitle, "fa")).toBe(fa.landing.heroTitle);
    expect(pick(values.heroTitle, "en")).toBe(en.landing.heroTitle);
    expect((values.features as unknown[]).length).toBe(8);
    expect((resolveDocument(faq, undefined).items as unknown[]).length).toBe(7);
  });

  it("falls back field by field, never breaking a page", () => {
    const values = resolveDocument(home, {
      heroTitle: { fa: "   ", en: "Custom" },
      heroBadge: 42,
      features: "not a list",
    });
    expect(pick(values.heroTitle, "fa")).toBe(fa.landing.heroTitle);
    expect(pick(values.heroTitle, "en")).toBe("Custom");
    expect(pick(values.heroBadge, "fa")).toBe(fa.landing.heroBadge);
    expect((values.features as unknown[]).length).toBe(8);
  });

  it("shows Persian where an English value has no default", () => {
    const values = resolveDocument(getDocumentDef("page-terms")!, {
      body: { fa: "متن" },
    });
    expect(pick(values.body, "en")).toBe("متن");
  });

  it("keeps an edited list as edited", () => {
    const values = resolveDocument(faq, {
      items: [{ q: { fa: "پرسش" }, a: { fa: "پاسخ" } }],
    });
    expect(values.items).toEqual([
      { q: { fa: "پرسش", en: "پرسش" }, a: { fa: "پاسخ", en: "پاسخ" } },
    ]);
  });

  it("validates with Persian messages and drops unknown keys", () => {
    const { data, errors } = validateDocument(site, {
      contactPhone: "abc",
      contactEmail: "no-at-sign",
      instagram: "javascript:alert(1)",
      trialDays: 400,
      somethingElse: "x",
    });
    expect(errors.contactPhone).toMatch(/تلفن/);
    expect(errors.contactEmail).toMatch(/ایمیل/);
    expect(errors.instagram).toMatch(/https/);
    expect(errors.trialDays).toMatch(/عدد/);
    expect(data).not.toHaveProperty("somethingElse");
  });

  it("refuses unsafe links inside rich text", () => {
    const { errors } = validateDocument(getDocumentDef("page-about")!, {
      body: { fa: "[x](javascript:alert(1))", en: "" },
    });
    expect(errors["body.fa"]).toBeDefined();
  });

  it("enforces maximum lengths", () => {
    const { errors } = validateDocument(home, {
      heroTitle: { fa: "x".repeat(81), en: "" },
    });
    expect(errors["heroTitle.fa"]).toBeDefined();
  });

  it("shows the announcement only when on, written and in its window", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const base = { announcementEnabled: true, announcementText: { fa: "تخفیف", en: "" } };
    expect(announcementLive(base, now)).toBe(true);
    expect(announcementLive({ ...base, announcementEnabled: false }, now)).toBe(false);
    expect(announcementLive({ ...base, announcementText: { fa: "", en: "" } }, now)).toBe(
      false,
    );
    expect(
      announcementLive({ ...base, announcementStartsAt: "2026-10-02T00:00:00Z" }, now),
    ).toBe(false);
    expect(
      announcementLive({ ...base, announcementEndsAt: "2026-09-30T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("keeps an empty English empty in the editor, but falls back on the page", () => {
    const stored = {
      heroTitle: { fa: "عنوان تازه", en: "" },
      features: [{ title: { fa: "منو", en: "" }, text: { fa: "متن", en: "" } }],
    };
    const page = resolveDocument(home, stored);
    const editor = resolveDocument(home, stored, "edit");
    const firstTitle = (values: Record<string, unknown>) =>
      (values.features as Record<string, unknown>[])[0]!.title;

    // The page: English default for a top-level field, Persian for a list item.
    expect(pick(page.heroTitle, "en")).toBe(en.landing.heroTitle);
    expect(pick(firstTitle(page), "en")).toBe("منو");

    // The editor: nothing copied in, so saving cannot store Persian as English.
    expect(pick(editor.heroTitle, "en")).toBe("");
    expect(pick(firstTitle(editor), "en")).toBe("");
    // A field never saved still starts from the site's English text.
    expect(pick(editor.heroSubtitle, "en")).toBe(en.landing.heroSubtitle);
  });
});
