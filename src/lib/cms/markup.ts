/**
 * The rich-text format the admin editor stores: a tiny, line-based markup,
 * never HTML.
 *
 *   ## heading          a section heading (### for a smaller one)
 *   - item              a bullet list item (consecutive lines form one list)
 *   **bold** *italic*   inline emphasis
 *   [text](https://…)   a link — https:, mailto:, tel: or a site path only
 *   blank line          paragraph break
 *
 * Pure: parsed into a small tree that `components/rich-text.tsx` turns into
 * React elements. Nothing is ever passed to `dangerouslySetInnerHTML`, so there
 * is no markup an editor (or anyone who got hold of an admin session) could
 * type that would run as script on the public site. Angle brackets are just
 * text. Links with any other scheme — `javascript:`, `data:` — are refused when
 * saved and rendered as plain text if one ever reaches the page anyway.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; items: Inline[][] };

/** Characters that have no business in stored text: NUL and C0/C1 controls except tab and newline. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function cleanText(input: string): string {
  return input.replace(/\r\n?/g, "\n").replace(CONTROL, "");
}

/**
 * Whether a link target may be rendered as a link.
 * Site-relative paths, https (and http for old sites), mailto and tel only.
 */
export function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/** Every link target written in the markup, for validation at save time. */
export function linksIn(source: string): string[] {
  return [...cleanText(source).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  // Order matters: links first (their text may contain emphasis), then bold
  // before italic so ** is not read as two single stars.
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index!;
    if (at > last) out.push({ type: "text", value: text.slice(last, at) });
    if (match[1] !== undefined) {
      const href = match[2]!;
      // An unsafe target is shown as its visible text, never as a link.
      if (isSafeHref(href)) {
        out.push({ type: "link", href: href.trim(), children: parseInline(match[1]) });
      } else {
        out.push({ type: "text", value: match[1] });
      }
    } else if (match[3] !== undefined) {
      out.push({ type: "strong", children: parseInline(match[3]) });
    } else if (match[4] !== undefined) {
      out.push({ type: "em", children: parseInline(match[4]) });
    }
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

export function parseMarkup(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      // Single newlines inside a paragraph are kept as line breaks by the
      // renderer, which is what someone typing an address expects.
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list.map(parseInline) });
      list = [];
    }
  };

  for (const raw of cleanText(source).split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    const item = /^[-•]\s+(.+)$/.exec(line.trim());

    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1]!.length === 2 ? 2 : 3,
        children: parseInline(heading[2]!),
      });
    } else if (item) {
      flushParagraph();
      list.push(item[1]!);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The visible text of some markup — for meta descriptions and search. */
export function plainText(source: string): string {
  const walk = (nodes: Inline[]): string =>
    nodes
      .map((node) => (node.type === "text" ? node.value : walk(node.children)))
      .join("");
  return parseMarkup(source)
    .map((block) =>
      block.type === "list" ? block.items.map(walk).join("، ") : walk(block.children),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
