/**
 * What a message costs, and what an SMS line will refuse to carry.
 *
 * Every rule here exists to catch a rejection *before* it is paid for. A
 * promotional broadcast is paid for by the venue up front and then sent by
 * platform staff through Melipayamak's own panel, which enforces the same rules
 * as its web service: a text containing a link is refused (code `14`), and a
 * multi-recipient text without the opt-out marker is refused (code `15`).
 * Finding either out after the venue has paid means a refund and an apology;
 * checking when the request is written costs nothing.
 *
 * Pure: no imports at all.
 */

/**
 * The opt-out marker Iranian regulation requires on non-transactional SMS.
 *
 * `11` is the cancellation keyword a recipient sends back. Latin digits are
 * used deliberately: the provider matches this literally, and «لغو۱۱» with
 * Persian digits is a different string. Worth confirming once in the panel
 * before the first real broadcast goes out; `SMS_OPT_OUT_SUFFIX` changes it
 * without a deploy.
 */
export const DEFAULT_OPT_OUT_SUFFIX = "لغو11";

// ------------------------------- SMS parts ---------------------------------

/**
 * Per-part character budgets.
 *
 * Persian text is outside GSM-7, so it is sent as UCS-2 at 70 characters per
 * message — and a concatenated one loses a further 3 to the segmentation header.
 * The difference is not academic: a 160-character Latin announcement is one SMS,
 * and the same length in Persian is three. An owner sending to 400 customers
 * pays for 1,200 messages instead of 400, and nothing in the interface would
 * have told them.
 */
const GSM7_SINGLE = 160;
const GSM7_CONCATENATED = 153;
const UCS2_SINGLE = 70;
const UCS2_CONCATENATED = 67;

/**
 * The GSM 03.38 basic set plus its extension characters.
 *
 * Anything outside it forces the whole message to UCS-2 — one Persian letter in
 * an otherwise Latin text more than halves the budget, which is exactly the case
 * that surprises people.
 */
const GSM7_CHARS = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
    "^{}\\[~]|€",
);

export type SmsEncoding = "GSM7" | "UCS2";

export function detectEncoding(text: string): SmsEncoding {
  for (const char of text) {
    if (!GSM7_CHARS.has(char)) return "UCS2";
  }
  return "GSM7";
}

export interface SmsCost {
  encoding: SmsEncoding;
  characters: number;
  /** How many SMS this text will be billed as. */
  parts: number;
}

/**
 * How many messages this text will be charged as.
 *
 * Counted in code points via the spread operator rather than `.length`, because
 * `String.prototype.length` counts UTF-16 units — an emoji counts as two and
 * would overstate the part count for anyone who put one in an announcement.
 */
export function estimateCost(text: string): SmsCost {
  const encoding = detectEncoding(text);
  const characters = [...text].length;

  const single = encoding === "GSM7" ? GSM7_SINGLE : UCS2_SINGLE;
  const concatenated = encoding === "GSM7" ? GSM7_CONCATENATED : UCS2_CONCATENATED;

  const parts =
    characters === 0
      ? 0
      : characters <= single
        ? 1
        : Math.ceil(characters / concatenated);

  return { encoding, characters, parts };
}

// --------------------------------- links -----------------------------------

/**
 * Anything the provider is likely to read as a link.
 *
 * Three shapes, in decreasing confidence: an explicit scheme, a `www.` host, and
 * a bare `something.tld` against a closed list of the endings that actually
 * appear in Iranian marketing copy. The bare-domain list is deliberately short —
 * matching every possible TLD would reject «قیمت‌ها از ۱۰.ir به بعد» and other
 * innocent text, and a false rejection an owner cannot explain is worse than a
 * provider error they can be shown.
 */
const LINK_PATTERNS = [
  /\b[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\.[a-z0-9-]+/i,
  /\b[a-z0-9-]+\.(?:ir|com|net|org|info|co|me|app|shop|site|online|xyz)\b/i,
];

export function containsLink(text: string): boolean {
  return LINK_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Whether a pattern variable is safe to send.
 *
 * `SendByBaseNumber` rejects variables containing a link with code `-10`,
 * naming no field. Checking first names the offending value and spends no
 * message. The one pattern today, OTP, carries only a generated code, so this
 * guards any future pattern that interpolates stored text.
 */
export function variablesContainLink(variables: readonly string[]): boolean {
  return variables.some((value) => containsLink(String(value)));
}

// ------------------------------- opt-out -----------------------------------

/**
 * Ensures a bulk text carries the opt-out suffix exactly once.
 *
 * Idempotent, because the text reaching this function may already have been
 * composed with a suffix by an owner who knows the rule, and a message ending
 * «لغو11 لغو11» looks like a bug to every recipient who reads it.
 *
 * The check is on the whole text rather than the ending: some owners write the
 * marker on its own line before a signature, which satisfies the provider and
 * should not be duplicated.
 */
export function withOptOutSuffix(text: string, suffix = DEFAULT_OPT_OUT_SUFFIX): string {
  const body = text.trimEnd();
  const marker = suffix.trim();

  if (!marker) return body;
  if (body.includes(marker)) return body;

  return `${body}\n${marker}`;
}

// ------------------------------ validation ---------------------------------

export type BulkTextIssue = "EMPTY" | "CONTAINS_LINK";

/**
 * What is wrong with a bulk text, if anything.
 *
 * Returns a key rather than a message, the same convention `campaigns.ts` and
 * `report-insights.ts` use, so the dashboard renders it in the owner's language.
 *
 * The opt-out suffix is not checked here: it is *added* by `withOptOutSuffix`
 * rather than demanded of the caller, so its absence is never an error the owner
 * has to fix.
 */
export function bulkTextIssue(text: string): BulkTextIssue | null {
  if (!text.trim()) return "EMPTY";
  if (containsLink(text)) return "CONTAINS_LINK";
  return null;
}
