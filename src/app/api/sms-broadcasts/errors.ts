import { HttpError } from "@/lib/auth/guards";
import type { BroadcastIssue } from "@/lib/sms-broadcast";

/**
 * Turns a broadcast refusal into the API's standard failure shape, the way
 * `campaigns/errors.ts` does for campaigns: one table, so the quote and the
 * purchase cannot answer the same problem with two different statuses.
 *
 * The `code` is what the dashboard renders through `localizeApiError`.
 */
export type BroadcastError = BroadcastIssue | "CAMPAIGN_NOT_FOUND";

const STATUS: Record<BroadcastError, number> = {
  // Another venue's campaign is indistinguishable from one that does not exist.
  CAMPAIGN_NOT_FOUND: 404,
  // Something about what the owner wrote.
  EMPTY: 422,
  CONTAINS_LINK: 422,
  TOO_LONG: 422,
  // Well-formed, but there is nobody to send it to — a fact about the venue's
  // customers rather than about the request, hence 409.
  NO_RECIPIENTS: 409,
};

const CODE: Record<BroadcastError, string> = {
  CAMPAIGN_NOT_FOUND: "CAMPAIGN_NOT_FOUND",
  EMPTY: "SMS_TEXT_EMPTY",
  CONTAINS_LINK: "SMS_TEXT_CONTAINS_LINK",
  TOO_LONG: "SMS_TEXT_TOO_LONG",
  NO_RECIPIENTS: "SMS_NO_RECIPIENTS",
};

/** Fallback copy for non-browser callers; the dashboard shows the localized code. */
const MESSAGE: Record<BroadcastError, string> = {
  CAMPAIGN_NOT_FOUND: "Campaign not found",
  EMPTY: "The message is empty",
  CONTAINS_LINK: "The message contains a link, which SMS lines refuse",
  TOO_LONG: "The message is too long",
  NO_RECIPIENTS: "No consenting customer can receive this message",
};

export function broadcastError(error: BroadcastError): HttpError {
  return new HttpError(STATUS[error], MESSAGE[error], CODE[error]);
}
