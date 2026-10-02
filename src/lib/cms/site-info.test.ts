import { describe, expect, it } from "vitest";
import { getDocumentDef, resolveDocument } from "./schema";
import { enamadUrls, siteInfo, telHref } from "./site-info";

const site = getDocumentDef("site")!;

describe("site info", () => {
  it("dials Iranian numbers internationally", () => {
    expect(telHref("021-8877 6655")).toBe("tel:+982188776655");
    expect(telHref("09121234567")).toBe("tel:+989121234567");
    expect(telHref("+98 21 88776655")).toBe("tel:+982188776655");
    expect(telHref("0098 21 88776655")).toBe("tel:+982188776655");
  });

  it("shows nothing for details left empty — never a placeholder", () => {
    const info = siteInfo(resolveDocument(site, null), "fa");
    expect(info.phone).toBeNull();
    expect(info.socials).toEqual([]);
    expect(info.enamad).toBeNull();
    expect(info.announcement).toBeNull();
    expect(info.ogImage).toBeNull();
    expect(info.email).toBe("hello@restokar.ir");
    expect(info.trialDays).toBe(14);
  });

  it("builds links from what the admin entered", () => {
    const info = siteInfo(
      resolveDocument(site, {
        contactPhone: "021-88776655",
        instagram: "https://instagram.com/restokar",
        enamadId: "123",
        enamadCode: "abc",
        seoKeywords: "منو، QR, digital menu",
      }),
      "en",
    );
    expect(info.phone).toEqual({ display: "021-88776655", href: "tel:+982188776655" });
    expect(info.socials).toEqual([
      { key: "instagram", label: "Instagram", href: "https://instagram.com/restokar" },
    ]);
    expect(info.seoKeywords).toEqual(["منو", "QR", "digital menu"]);
    expect(enamadUrls(info.enamad!)).toEqual({
      href: "https://trustseal.enamad.ir/?id=123&Code=abc",
      image: "https://trustseal.enamad.ir/logo.aspx?id=123&Code=abc",
    });
  });

  it("needs both eNamad parts before showing the seal", () => {
    const info = siteInfo(resolveDocument(site, { enamadId: "123" }), "fa");
    expect(info.enamad).toBeNull();
  });
});
