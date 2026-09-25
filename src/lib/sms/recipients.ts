import { normalisePhone } from "../phone";
import type { DroppedRecipient } from "./types";

/**
 * Turning phone numbers into ones an SMS can actually reach.
 *
 * Reuses `normalisePhone` rather than restating the rules: that function already
 * understands `+98`, `0098`, a bare `98`, a missing trunk zero and Persian or
 * Arabic-Indic digits, and it is what wrote every `Customer.phone` in the
 * database. A second normaliser here would eventually disagree with the one the
 * customer book uses, and the symptom would be a campaign that silently misses
 * the guests whose numbers were stored in the other form.
 *
 * What this adds is the part `normalisePhone` deliberately does not do:
 * **deciding what is not an Iranian mobile.** That function is careful to return
 * unrecognised input unchanged, because on the order path a landline is still
 * the only way to reach a guest. SMS needs the opposite answer — anything that
 * is not a mobile cannot receive a text, and must be dropped before it costs a
 * message or a line in a paid broadcast.
 *
 * Pure: no database, no provider, no framework.
 */

/** The canonical form, and the only shape the provider is given. */
const IRANIAN_MOBILE = /^09\d{9}$/;

export function isIranianMobile(value: string): boolean {
  return IRANIAN_MOBILE.test(value);
}

/**
 * Normalises a single number for sending, or `null` if it cannot receive SMS.
 *
 * Returns `null` rather than throwing, like `normalisePhone`: a mistyped number
 * is bad input from one person, and every caller — a code request, a
 * broadcast's recipient list — needs to refuse or skip it, not crash on it.
 */
export function toSendableNumber(raw: string | null | undefined): string | null {
  const normalised = normalisePhone(raw);
  if (!normalised) return null;
  return isIranianMobile(normalised) ? normalised : null;
}

export interface PreparedRecipients {
  /** Canonical, unique, in first-seen order. */
  phones: string[];
  dropped: DroppedRecipient[];
}

/**
 * Normalises, validates and de-duplicates a recipient list.
 *
 * First-seen order is preserved rather than sorted: this function only cleans
 * a list, and a caller that needs a stable order — the broadcast file does —
 * sorts the result itself.
 *
 * Duplicates are dropped rather than sent twice. The same guest appearing under
 * `0912...` and `+98912...` is one person who would otherwise receive the same
 * announcement twice — and, for a paid broadcast, be charged for twice.
 */
export function prepareRecipients(
  raw: readonly (string | null | undefined)[],
): PreparedRecipients {
  const phones: string[] = [];
  const dropped: DroppedRecipient[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const label = (entry ?? "").toString().trim();
    const sendable = toSendableNumber(entry);

    if (!sendable) {
      dropped.push({ raw: label, reason: "INVALID" });
      continue;
    }

    if (seen.has(sendable)) {
      dropped.push({ raw: label, reason: "DUPLICATE" });
      continue;
    }

    seen.add(sendable);
    phones.push(sendable);
  }

  return { phones, dropped };
}

/**
 * Masks a number for logging: `0912***6789`.
 *
 * Logs outlive the incident that produced them and get copied into tickets and
 * pasted into chats. A full subscriber number in one is a customer's contact
 * detail leaving the venue's control, so the log keeps only enough to recognise
 * a number an operator already has in front of them.
 */
export function maskPhone(phone: string): string {
  const value = (phone ?? "").trim();
  if (value.length < 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}
