/**
 * Turning an error into something safe to keep.
 *
 * Free of database imports so the rules can be tested on their own; the writer
 * is error-log.ts. The rules exist because an error log is the place personal
 * data leaks into by accident: a request path carries an order's public token,
 * a message can quote a phone number, a stack can be enormous.
 */

export const MAX_MESSAGE = 500;
export const MAX_STACK = 4_000;

/**
 * A path with its query string dropped and anything that looks like a token or
 * an id masked. `/menu/narenj/order/Xk3…9` becomes `/menu/narenj/order/:id`,
 * so a public order token never sits in a table an admin can browse — and the
 * same page breaking for two guests is one entry, not two.
 */
export function maskPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  return (
    withoutQuery
      .split("/")
      .map((segment) =>
        /^[A-Za-z0-9_-]{16,}$/.test(segment) || /^\d{4,}$/.test(segment)
          ? ":id"
          : segment,
      )
      .join("/")
      .slice(0, 300) || "/"
  );
}

/** Digits that could be a phone number or a card, blanked out of free text. */
export function scrubText(text: string): string {
  return text.replace(/\d{6,}/g, (run) => "#".repeat(Math.min(run.length, 12)));
}

export function clip(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * What makes two reports "the same error": where it happened and what it
 * said, with numbers flattened so "order 1234 failed" and "order 1235 failed"
 * group together. Short and stable; collisions only merge two counters.
 */
export function fingerprintOf(parts: {
  source: string;
  message: string;
  path: string | null;
  context?: string | null;
}): string {
  const text = [
    parts.source,
    parts.context ?? "",
    parts.path ?? "",
    parts.message.replace(/\d+/g, "N").slice(0, 200),
  ].join("|");
  // FNV-1a, twice with different seeds, for a 64-bit-ish hex key without
  // pulling crypto into code that also runs in the browser bundle's tests.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x811c9dc5);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
