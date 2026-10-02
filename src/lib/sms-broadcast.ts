import type { AudienceCandidate } from "./campaigns";
import { canBeContacted, CUSTOMER_SEGMENTS, resolveSegment } from "./customers";
import { prepareRecipients } from "./sms/recipients";
import {
  estimateCost,
  promoTextIssue,
  withOptOutSuffix,
  type SmsEncoding,
} from "./sms/text";
import type { DroppedRecipient } from "./sms/types";

/**
 * Promotional SMS, sold rather than sent.
 *
 * A venue that wants to text its customers — for a campaign or for any other
 * announcement — writes the message, chooses who receives it, sees what it
 * costs, and pays. **The application never delivers it.** The paid request waits
 * in the admin console, where platform staff download the recipient file and
 * send it with a separate tool. The SMS API in `sms/` carries one-time codes
 * and nothing else, and `sms-broadcast-isolation.test.ts` refuses any broadcast
 * module that reaches for it.
 *
 * This file decides the rules: who is a recipient, what a message costs, and
 * which moves a request may make. Pure — no database, no framework, no provider
 * — so each rule is tested directly, and client code can import the constants.
 */

// -------------------------------- audience ---------------------------------

/**
 * Who a broadcast can be aimed at: every consenting customer, or one segment.
 *
 * The segments are `CUSTOMER_SEGMENTS`, never a second list — a venue comparing
 * the customer book with the broadcast screen must see one definition of
 * "at risk". `all` is the one addition, because an announcement ("we are open
 * on Friday") is not aimed at any particular group.
 */
export const SMS_AUDIENCES = ["all", ...CUSTOMER_SEGMENTS] as const;

export type SmsAudience = (typeof SMS_AUDIENCES)[number];

export interface SelectedRecipients {
  /** Canonical, unique, consented mobiles, in first-seen order. */
  phones: string[];
  /** Consented numbers that still could not be used: a landline, a duplicate. */
  dropped: DroppedRecipient[];
}

/**
 * The numbers a broadcast goes to.
 *
 * Three filters, in this order:
 *
 *   1. **Consent**, through `canBeContacted` — the same rule the campaign screen's
 *      "reachable" figure uses. A guest who never agreed to marketing is not a
 *      recipient however loyal they are.
 *   2. **Audience**, through `resolveSegment` over the guest's whole history.
 *   3. **Sendability**, through `prepareRecipients`: canonical form, mobiles
 *      only, each person once. A landline typed at checkout is a real contact
 *      number and cannot receive a text; charging for it would be charging for
 *      nothing.
 *
 * The count this returns is what the venue pays for, so it is the count of
 * numbers that can actually receive the message — never the size of the
 * segment.
 */
export function selectRecipients(
  candidates: readonly AudienceCandidate[],
  audience: SmsAudience,
  now: Date,
): SelectedRecipients {
  const phones: (string | null)[] = [];

  for (const candidate of candidates) {
    if (!canBeContacted(candidate)) continue;

    if (audience !== "all") {
      const segment = resolveSegment(
        { orderCount: candidate.orderCount, lastOrderAt: candidate.lastOrderAt },
        now,
      );
      if (segment !== audience) continue;
    }

    phones.push(candidate.phone);
  }

  const prepared = prepareRecipients(phones);

  // Sorted, because the database hands customers back in no promised order.
  // A frozen list is then the same file on every download, two broadcasts to
  // one audience can be compared line by line, and staff scanning it can find a
  // number. Canonical `09…` strings of equal length sort numerically as text.
  return { phones: prepared.phones.sort(), dropped: prepared.dropped };
}

// --------------------------------- pricing ---------------------------------

/**
 * Longest message a venue may buy, in SMS parts.
 *
 * Five Persian parts is roughly 335 characters — more than any announcement
 * needs. The ceiling exists because the bill multiplies by parts: a pasted
 * paragraph of 20 parts sent to 400 customers is 8,000 messages, and nobody
 * intends that from a text box.
 */
export const MAX_BROADCAST_PARTS = 5;

/** Input ceiling for the text field, generous enough never to bind first. */
export const MAX_BROADCAST_TEXT_LENGTH = 1000;

export type BroadcastIssue = "EMPTY" | "CONTAINS_LINK" | "TOO_LONG" | "NO_RECIPIENTS";

export interface BroadcastQuote {
  /** Exactly what is sent and what is priced: the text plus the opt-out marker. */
  body: string;
  characters: number;
  encoding: SmsEncoding;
  /** SMS parts per recipient. */
  parts: number;
  recipientCount: number;
  /** Whole Toman per part per recipient. */
  pricePerPart: number;
  /** Whole Toman. recipientCount × parts × pricePerPart. */
  amount: number;
  /** Why this cannot be bought as it stands, or null. */
  issue: BroadcastIssue | null;
}

/**
 * What a broadcast costs, and whether it can be bought at all.
 *
 * Measured **after** the opt-out marker is appended. The marker is part of every
 * message that goes out, so a text one character under a part boundary becomes
 * two parts once it is added — pricing the bare text would undercharge on
 * exactly those messages, every time.
 *
 * Issues are ordered by what the owner must fix first. Text problems come before
 * the recipient count because they are the owner's to correct on this screen;
 * an empty audience is a fact about their customers, not about what they typed.
 * Returns a key rather than a message, so the dashboard renders it in the
 * owner's language — the convention `campaigns.ts` follows.
 */
export function quoteBroadcast(input: {
  text: string;
  recipientCount: number;
  pricePerPart: number;
  optOutSuffix: string;
}): BroadcastQuote {
  const text = input.text.trim();
  const body = withOptOutSuffix(text, input.optOutSuffix);
  const cost = estimateCost(body);

  const recipientCount = Math.max(0, Math.floor(input.recipientCount));
  const pricePerPart = Math.max(0, Math.floor(input.pricePerPart));

  let issue: BroadcastIssue | null = promoTextIssue(text);
  if (!issue && cost.parts > MAX_BROADCAST_PARTS) issue = "TOO_LONG";
  if (!issue && recipientCount === 0) issue = "NO_RECIPIENTS";

  return {
    body,
    characters: cost.characters,
    encoding: cost.encoding,
    parts: cost.parts,
    recipientCount,
    pricePerPart,
    amount: recipientCount * cost.parts * pricePerPart,
    issue,
  };
}

// -------------------------------- statuses ---------------------------------

export const SMS_BROADCAST_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "SENT",
  "CANCELED",
] as const;

export type SmsBroadcastStatus = (typeof SMS_BROADCAST_STATUSES)[number];

/**
 * The whole lifecycle, in one table.
 *
 *   - `PENDING_PAYMENT → PAID` happens **only** in the payment callback, after
 *     the gateway has verified the money server-to-server. No person can make
 *     it, which is why it is absent from `STAFF_MOVES`.
 *   - `PAID → SENT` is staff confirming they sent it with the external tool.
 *   - `PAID → CANCELED` is staff refusing it — offensive content, a number the
 *     line will not carry. The venue is owed a refund, handled outside the app.
 *   - Staff cannot cancel `PENDING_PAYMENT`. A payment might be settling at that
 *     very moment, and cancelling underneath it would take money for a request
 *     that no longer exists. Abandoned checkouts are deleted by the scheduled
 *     housekeeping instead, once no payment could still complete.
 */
export const SMS_BROADCAST_TRANSITIONS: Record<
  SmsBroadcastStatus,
  readonly SmsBroadcastStatus[]
> = {
  PENDING_PAYMENT: ["PAID"],
  PAID: ["SENT", "CANCELED"],
  SENT: [],
  CANCELED: [],
};

/** The moves platform staff may make by hand. */
export const STAFF_MOVES: readonly SmsBroadcastStatus[] = ["SENT", "CANCELED"];

export function staffCanMove(from: SmsBroadcastStatus, to: SmsBroadcastStatus): boolean {
  return STAFF_MOVES.includes(to) && SMS_BROADCAST_TRANSITIONS[from].includes(to);
}

// -------------------------------- payment ----------------------------------

/**
 * Whether a payment actually moved money.
 *
 * The mock gateway settles instantly and moves nothing. A broadcast "paid"
 * through it is a demonstration, and staff sending it would pay the SMS line
 * out of their own pocket for a message nobody bought — so the admin queue asks
 * this before offering to send.
 */
export function isRealPayment(provider: string | null | undefined): boolean {
  return Boolean(provider) && provider !== "mock";
}

// ------------------------------ recipient file -----------------------------

/**
 * The file staff upload to the sending tool: one number per line.
 *
 * Plain text rather than CSV on purpose. A `.csv` opens in Excel by default,
 * and Excel reads `09121234567` as a number and silently drops the leading zero —
 * every line in the file would then be a number the SMS panel rejects. A `.txt`
 * opens in a text editor and uploads as written.
 *
 * CRLF line endings, because the people opening it are on Windows and Notepad
 * is where they will look first. Every SMS panel accepts either.
 */
export function recipientsFileContent(phones: readonly string[]): string {
  return phones.length === 0 ? "" : `${phones.join("\r\n")}\r\n`;
}

/**
 * `restokar-sms-<venue>-<id>.txt`.
 *
 * The venue slug so staff can see whose list it is from the downloads folder;
 * the tail of the id so two broadcasts for one venue never overwrite each other.
 * Anything outside `[a-z0-9-]` is dropped rather than escaped, because a
 * `Content-Disposition` filename is the wrong place to be clever.
 */
export function recipientsFileName(broadcastId: string, venueSlug: string): string {
  const slug = venueSlug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "venue";
  const tail =
    broadcastId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(-8) || "list";
  return `restokar-sms-${slug}-${tail}.txt`;
}
