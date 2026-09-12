import { HttpError } from "@/lib/auth/guards";
import type { CampaignWriteError } from "@/lib/campaigns-server";

/**
 * Turns a campaign rule refusal into the API's standard failure shape.
 *
 * One table rather than a `throw` at each refusal site, so the three routes
 * that can hit the same rule cannot answer with three different statuses.
 *
 * The `code` is what the dashboard renders — `localizeApiError` looks it up in
 * `t.errors.codes`, so an owner reads the reason in their own language and the
 * route carries no copy of its own.
 */
const STATUS: Record<CampaignWriteError, number> = {
  // A campaign of another tenant is indistinguishable from one that does not
  // exist. Both are 404, deliberately.
  NOT_FOUND: 404,
  // The request was well-formed; the campaign is simply not in a state that
  // allows it. 409 rather than 422 — nothing about the body is wrong.
  NOT_EDITABLE: 409,
  INVALID_TRANSITION: 409,
  // These are about what was sent: an id that is not this venue's, or a window
  // that cannot be satisfied.
  PRODUCT_NOT_FOUND: 422,
  CATEGORY_NOT_FOUND: 422,
  END_BEFORE_START: 422,
  MISSING_START: 422,
  ENDS_IN_PAST: 422,
};

/**
 * Fallback copy only. The dashboard shows the localized string for the code;
 * this is what a non-browser caller sees, and it is deliberately vague about
 * *why* an id was not found — see the 404 note above.
 */
const MESSAGE: Record<CampaignWriteError, string> = {
  NOT_FOUND: "Campaign not found",
  NOT_EDITABLE: "This campaign can no longer be edited",
  INVALID_TRANSITION: "That status change is not allowed",
  PRODUCT_NOT_FOUND: "Product not found",
  CATEGORY_NOT_FOUND: "Category not found",
  END_BEFORE_START: "The end date must be after the start date",
  MISSING_START: "A scheduled campaign needs a start date",
  ENDS_IN_PAST: "That campaign window has already closed",
};

export function campaignError(error: CampaignWriteError): HttpError {
  return new HttpError(STATUS[error], MESSAGE[error], `CAMPAIGN_${error}`);
}
