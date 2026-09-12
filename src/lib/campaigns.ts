import { canBeContacted, resolveSegment, type CustomerSegment } from "./customers";

/**
 * What a marketing campaign is, before anything can be sent.
 *
 * This phase builds the plan and nothing else: a campaign names an audience,
 * optionally points at a dish or a section of the menu, and moves through a
 * small set of states. **No message is delivered by any code in this codebase**
 * — there is no provider, no gateway, and no outbound call. The abstraction
 * below exists so that adding one later is a matter of implementing a channel
 * rather than retrofitting consent, eligibility and state onto rows that never
 * recorded them.
 *
 * Free of database and framework imports, like `pricing.ts`, `availability.ts`
 * and `customers.ts`. The state machine decides what an owner is allowed to do
 * to a campaign, which is worth testing directly and must not be restated in a
 * route handler where it could drift.
 *
 * Segmentation is **not** defined here. Who counts as loyal or at risk is
 * `resolveSegment` in `customers.ts`, and campaigns reuse it rather than
 * carrying a second copy of the thresholds.
 */

// -------------------------------- statuses ---------------------------------

/**
 * `CANCELED` with one L, matching `OrderStatus.CANCELED` and
 * `SubscriptionStatus.CANCELED`. The codebase already made that spelling choice
 * and two spellings in one schema is worse than either one.
 */
export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELED",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export function isCampaignStatus(value: string): value is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

/**
 * Paging bounds for the campaign list.
 *
 * Here rather than beside the query that uses them for the same reason
 * `customers.ts` keeps its own: the request schema validates against
 * `MAX_CAMPAIGN_PAGE_SIZE`, and that schema is imported by client code — a
 * constant behind a `server-only` marker would drag the database module into
 * the browser bundle.
 */
export const DEFAULT_CAMPAIGN_PAGE_SIZE = 20;
export const MAX_CAMPAIGN_PAGE_SIZE = 100;

/**
 * Which states each state may move to. The whole workflow, in one table.
 *
 * Deliberately small. A campaign is a plan an owner commits to, pauses, and
 * eventually finishes or abandons — modelling approval chains or draft
 * revisions would be workflow nobody asked for.
 *
 * Three rules shape it:
 *
 *   1. **Terminal means terminal.** `COMPLETED` and `CANCELED` go nowhere. A
 *      finished campaign that could be restarted is not a record of what
 *      happened, and re-running one is a new campaign with its own audience.
 *   2. **Only a plan can be re-opened.** `SCHEDULED` may drop back to `DRAFT`
 *      because nothing has run yet; `ACTIVE` and `PAUSED` may not, because what
 *      a running campaign was configured to do is a matter of record.
 *   3. **Nothing may be finished before it starts.** `DRAFT` and `SCHEDULED`
 *      cannot reach `COMPLETED`; they can only be cancelled.
 */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  DRAFT: ["SCHEDULED", "ACTIVE", "CANCELED"],
  SCHEDULED: ["ACTIVE", "PAUSED", "DRAFT", "CANCELED"],
  ACTIVE: ["PAUSED", "COMPLETED", "CANCELED"],
  PAUSED: ["ACTIVE", "COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

/**
 * Whether a move is allowed. The server's answer, not the button's.
 *
 * A status equal to itself is refused rather than treated as a no-op: a request
 * to pause an already-paused campaign is a stale client, and answering "done"
 * to it would write an audit entry describing something that did not happen.
 */
export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

/** Nothing leaves these. Derived from the table so the two cannot disagree. */
export function isTerminal(status: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[status].length === 0;
}

/**
 * Whether the campaign's configuration may still be changed.
 *
 * A plan is editable; a run is not. Once a campaign is `ACTIVE` its audience,
 * its window and its product context are what it went out with, and letting
 * those be rewritten afterwards would make the record describe a campaign that
 * never existed.
 */
export function isEditable(status: CampaignStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED";
}

/**
 * Whether entering this state should record how big the audience was.
 *
 * See the note on snapshots in `campaigns-server.ts`: the stored figure is a
 * single integer taken at the moment the owner committed to the campaign, not a
 * list of recipients.
 */
export function capturesAudience(status: CampaignStatus): boolean {
  return status === "SCHEDULED" || status === "ACTIVE";
}

// ------------------------------- scheduling --------------------------------

export type CampaignScheduleIssue = "END_BEFORE_START" | "MISSING_START" | "ENDS_IN_PAST";

export interface CampaignWindow {
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/**
 * What is wrong with this campaign's window, if anything.
 *
 * Returns a key rather than a message so the dashboard can render it in the
 * owner's language — the same shape `report-insights.ts` uses.
 *
 * The checks are ordered by how fundamental they are:
 *
 *   1. **An impossible window** is wrong whatever the state, including on a
 *      draft: a window that closes before it opens can never be open, and
 *      saving it would leave the owner with a campaign that silently never runs.
 *   2. **A missing start** only matters when scheduling. "Schedule" means "at a
 *      time", and a scheduled campaign with no time is not scheduled.
 *      Activating immediately needs no start — the start is now.
 *   3. **A closed window** only matters when committing to a run. An owner may
 *      keep a lapsed draft around; they may not schedule one, because it can
 *      never open.
 *
 * A start already in the past is deliberately allowed: backdating the beginning
 * of a run describes something already true rather than something impossible.
 */
export function scheduleIssue(
  status: CampaignStatus,
  window: CampaignWindow,
  now: Date,
): CampaignScheduleIssue | null {
  const startsAt = window.startsAt ?? null;
  const endsAt = window.endsAt ?? null;

  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return "END_BEFORE_START";
  }

  if (status === "SCHEDULED" && !startsAt) return "MISSING_START";

  if (capturesAudience(status) && endsAt && endsAt.getTime() <= now.getTime()) {
    return "ENDS_IN_PAST";
  }

  return null;
}

// -------------------------- communication (no provider) --------------------

/**
 * Channels a future gateway might carry a campaign over.
 *
 * Named, and nothing more. **None of them exists.** There is no SMS provider,
 * no mail sender for campaigns, and no push service; `isChannelAvailable`
 * answers `false` for every one of them and there is no code path that sends.
 *
 * They are listed so the concepts a delivery system needs — a channel, a
 * per-recipient eligibility answer, a delivery state — have names that the
 * dashboard can already render as "not available", rather than the dashboard
 * implying a capability the platform does not have.
 */
export const COMMUNICATION_CHANNELS = ["sms", "email", "push"] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

/**
 * Whether anything can carry a message on this channel.
 *
 * Always `false`, and deliberately a function rather than a constant so the day
 * a gateway is configured there is one place to change — with the tests that
 * currently assert "nothing is deliverable" pointing straight at it.
 */
export function isChannelAvailable(_channel: CommunicationChannel): boolean {
  return false;
}

/**
 * Why a guest would or would not receive this campaign.
 *
 * Reuses `canBeContacted` from `customers.ts` rather than restating the consent
 * rule; what this adds is *which* condition failed, and the channel check that
 * a single boolean has no room for.
 *
 * `ELIGIBLE` is unreachable while no channel exists. That is the point: the
 * only way anything becomes eligible is for `isChannelAvailable` to start
 * answering true, which requires a provider that has deliberately not been
 * built.
 */
export type RecipientEligibility =
  "ELIGIBLE" | "NO_CONTACT_METHOD" | "NO_CONSENT" | "CHANNEL_UNAVAILABLE";

export function recipientEligibility(
  customer: { phone: string | null; marketingConsent: boolean },
  channel: CommunicationChannel,
): RecipientEligibility {
  if (!customer.phone) return "NO_CONTACT_METHOD";
  if (!canBeContacted(customer)) return "NO_CONSENT";
  if (!isChannelAvailable(channel)) return "CHANNEL_UNAVAILABLE";

  return "ELIGIBLE";
}

// -------------------------------- audience ---------------------------------

/**
 * The little a customer has to reveal to be counted in an audience.
 *
 * Four fields, and no identity among them. The aggregation that produces these
 * rows reads phone numbers to answer "is there a contact method", never to
 * return them — see the privacy note in `campaigns-server.ts`.
 */
export interface AudienceCandidate {
  phone: string | null;
  marketingConsent: boolean;
  orderCount: number;
  lastOrderAt: Date | null;
}

export interface AudienceEstimate {
  /** Customers who fall in the campaign's target segment right now. */
  estimatedAudience: number;
  /** Of those, how many could be reached if a channel ever existed. */
  eligibleAudience: number;
}

/**
 * How many customers a campaign would target, and how many of them are
 * contactable.
 *
 * The segment rules are **not** restated here: `resolveSegment` from
 * `customers.ts` decides who is loyal or at risk, exactly as it does on the
 * customer book, so an owner comparing the two screens cannot see two different
 * answers. Likewise `canBeContacted` decides reachability.
 *
 * Pure, and takes already-aggregated rows, for the same reason `deriveCustomer`
 * does: the counting belongs in SQL where it stays fast, and the *rules* belong
 * here where they can be tested without a database.
 *
 * `eligibleAudience` is a subset of `estimatedAudience` by construction — it is
 * counted inside the segment test rather than beside it — so the pair can never
 * report more reachable people than targeted ones.
 */
export function summariseAudience(
  candidates: readonly AudienceCandidate[],
  segment: CustomerSegment,
  now: Date,
): AudienceEstimate {
  let estimatedAudience = 0;
  let eligibleAudience = 0;

  for (const candidate of candidates) {
    const resolved = resolveSegment(
      { orderCount: candidate.orderCount, lastOrderAt: candidate.lastOrderAt },
      now,
    );

    if (resolved !== segment) continue;

    estimatedAudience += 1;
    if (canBeContacted(candidate)) eligibleAudience += 1;
  }

  return { estimatedAudience, eligibleAudience };
}

// --------------------------------- metrics ---------------------------------

/**
 * What this phase can honestly report.
 *
 * Audience figures come from orders and consent the venue already holds, so
 * they are real numbers. Everything in `UNMEASURABLE_METRICS` would require a
 * delivery system that does not exist, and inventing a zero for them would be
 * worse than showing nothing — a zero reads as "nobody opened it" rather than
 * as "nothing was ever sent".
 */
export const MEASURABLE_METRICS = [
  "estimatedAudience",
  "eligibleAudience",
  "audienceSnapshotSize",
] as const;

export const UNMEASURABLE_METRICS = [
  "sent",
  "delivered",
  "interactions",
  "conversions",
  "attributedOrders",
  "attributedRevenue",
] as const;

export type MeasurableMetric = (typeof MEASURABLE_METRICS)[number];
export type UnmeasurableMetric = (typeof UNMEASURABLE_METRICS)[number];
export type CampaignMetric = MeasurableMetric | UnmeasurableMetric;

export function isMetricMeasurable(metric: CampaignMetric): boolean {
  return (MEASURABLE_METRICS as readonly string[]).includes(metric);
}
