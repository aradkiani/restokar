import { describe, expect, it } from "vitest";
import { cleanText, isSafeHref, linksIn, parseMarkup, plainText } from "./markup";

describe("rich-text markup", () => {
  it("parses headings, paragraphs and lists", () => {
    const blocks = parseMarkup("## قوانین\n\nمتن اول\nخط دوم\n\n- یک\n- دو");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list"]);
    expect(blocks[2]).toMatchObject({
      type: "list",
      items: [[{ value: "یک" }], [{ value: "دو" }]],
    });
  });

  it("parses bold, italic and safe links", () => {
    const [paragraph] = parseMarkup("**مهم** و *توجه* — [تماس](tel:+982100000000)");
    expect(paragraph).toMatchObject({
      type: "paragraph",
      children: [
        { type: "strong" },
        { type: "text", value: " و " },
        { type: "em" },
        { type: "text", value: " — " },
        { type: "link", href: "tel:+982100000000" },
      ],
    });
  });

  it("never turns a script scheme into a link", () => {
    const [paragraph] = parseMarkup("[کلیک](javascript:alert(1)) [x](data:text/html,1)");
    const kinds =
      paragraph!.type === "paragraph" ? paragraph!.children.map((c) => c.type) : [];
    expect(kinds).not.toContain("link");
  });

  it("treats HTML as plain text", () => {
    const [paragraph] = parseMarkup('<img src=x onerror="alert(1)">');
    expect(paragraph).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: '<img src=x onerror="alert(1)">' }],
    });
  });

  it("accepts only safe link targets", () => {
    expect(isSafeHref("https://restokar.ir")).toBe(true);
    expect(isSafeHref("/terms")).toBe(true);
    expect(isSafeHref("mailto:hello@restokar.ir")).toBe(true);
    expect(isSafeHref("tel:02144556677")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.example")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
  });

  it("finds every link target for validation", () => {
    expect(linksIn("[a](https://a.ir) و [b](javascript:x)")).toEqual([
      "https://a.ir",
      "javascript:x",
    ]);
  });

  it("strips control characters", () => {
    expect(cleanText("a\u0000b\r\nc")).toBe("ab\nc");
  });

  it("extracts plain text for descriptions", () => {
    expect(plainText("## عنوان\n\n**متن** با [لینک](/terms)")).toBe("عنوان متن با لینک");
  });
});
