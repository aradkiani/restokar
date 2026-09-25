import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audienceCandidates, type CampaignContext } from "./campaigns-server";
import { isCustomerSegment } from "./customers";
import { env } from "./env";
import { prisma } from "./prisma";
import {
  isRealPayment,
  quoteBroadcast,
  selectRecipients,
  staffCanMove,
  type BroadcastIssue,
  type BroadcastQuote,
  type SmsAudience,
  type SmsBroadcastStatus,
} from "./sms-broadcast";

/**
 * The database half of paid SMS broadcasts. The rules are in
 * `sms-broadcast.ts`; this is tenant scoping, the recipient snapshot and the
 * admin queue.
 *
 * **Nothing here sends a message**, and nothing here imports anything that
 * could — `sms-broadcast-isolation.test.ts` holds that against the source.
 *
 * Two kinds of caller, kept apart:
 *
 *   - **The venue** (`requireOwner`) prices and pays for a broadcast. Every
 *     function it reaches takes a `restaurantId` from the session and returns
 *     counts — never the numbers themselves.
 *   - **Platform staff** (`requireAdmin`) work the queue across all venues and
 *     are the only callers that ever receive the recipient list.
 */

// -------------------------------- pricing ----------------------------------

export interface BroadcastRequest {
  text: string;
  /** Ignored when `campaignId` is given: the campaign decides the audience. */
  audience?: SmsAudience;
  campaignId?: string | null;
}

export type BuildResult =
  | {
      ok: true;
      quote: BroadcastQuote;
      audience: SmsAudience;
      campaign: { id: string; name: string } | null;
      phones: string[];
    }
  | { ok: false; error: "CAMPAIGN_NOT_FOUND" };

/**
 * Resolves who a broadcast would reach and what it would cost.
 *
 * A campaign contributes its whole audience definition — segment *and* product
 * or category context — so an owner pressing "send SMS" on a campaign about the
 * dessert menu reaches the guests who ordered desserts, not every guest in the
 * segment. The campaign is looked up under the session's tenant, so an id from
 * another venue is simply not found.
 */
export async function buildBroadcast(
  restaurantId: string,
  request: BroadcastRequest,
  now: Date = new Date(),
): Promise<BuildResult> {
  let audience: SmsAudience = request.audience ?? "all";
  let context: CampaignContext = {};
  let campaign: { id: string; name: string } | null = null;

  if (request.campaignId) {
    const row = await prisma.campaign.findFirst({
      where: { id: request.campaignId, restaurantId },
      select: {
        id: true,
        name: true,
        targetSegment: true,
        productId: true,
        categoryId: true,
      },
    });
    if (!row) return { ok: false, error: "CAMPAIGN_NOT_FOUND" };

    // The column is CHECK-constrained to the segment keys, so this only fails
    // if the constraint and `CUSTOMER_SEGMENTS` have drifted — worth refusing
    // rather than silently widening the audience to everyone.
    if (!isCustomerSegment(row.targetSegment)) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }

    audience = row.targetSegment;
    context = { productId: row.productId, categoryId: row.categoryId };
    campaign = { id: row.id, name: row.name };
  }

  const candidates = await audienceCandidates(restaurantId, context);
  const { phones } = selectRecipients(candidates, audience, now);

  const quote = quoteBroadcast({
    text: request.text,
    recipientCount: phones.length,
    pricePerPart: env.SMS_PRICE_PER_PART,
    optOutSuffix: env.SMS_OPT_OUT_SUFFIX,
  });

  return { ok: true, quote, audience, campaign, phones };
}

export type CreateResult =
  | { ok: true; id: string; quote: BroadcastQuote }
  | { ok: false; error: "CAMPAIGN_NOT_FOUND" | BroadcastIssue };

/**
 * Prices a broadcast and records it, awaiting payment.
 *
 * The recipient list is frozen here, in the same statement as the price it
 * produced. Re-evaluating the audience when the payment settles would let the
 * list the venue paid for and the list staff send to differ — a guest who
 * lapsed into another segment in the meantime, a new guest who consented — and
 * either way somebody is charged for a message they did not get, or sent one
 * nobody paid for.
 */
export async function createBroadcast(
  restaurantId: string,
  userId: string,
  request: BroadcastRequest,
  now: Date = new Date(),
): Promise<CreateResult> {
  const built = await buildBroadcast(restaurantId, request, now);
  if (!built.ok) return built;

  const { quote } = built;
  if (quote.issue) return { ok: false, error: quote.issue };

  const row = await prisma.smsBroadcast.create({
    data: {
      restaurantId,
      campaignId: built.campaign?.id ?? null,
      audience: built.audience,
      text: request.text.trim(),
      body: quote.body,
      recipients: built.phones,
      recipientCount: quote.recipientCount,
      smsParts: quote.parts,
      pricePerPart: quote.pricePerPart,
      amount: quote.amount,
      createdByUserId: userId,
    },
    select: { id: true },
  });

  return { ok: true, id: row.id, quote };
}

// ------------------------------ venue history ------------------------------

export interface VenueBroadcast {
  id: string;
  audience: string;
  campaignName: string | null;
  text: string;
  recipientCount: number;
  smsParts: number;
  amount: number;
  status: SmsBroadcastStatus;
  createdAt: Date;
  paidAt: Date | null;
  sentAt: Date | null;
}

/**
 * A venue's own broadcasts, newest first. **Counts only** — the recipient list
 * is deliberately not selected, so no shape returned here could carry a number.
 */
export async function listVenueBroadcasts(
  restaurantId: string,
  take = 20,
): Promise<VenueBroadcast[]> {
  const rows = await prisma.smsBroadcast.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      audience: true,
      text: true,
      recipientCount: true,
      smsParts: true,
      amount: true,
      status: true,
      createdAt: true,
      paidAt: true,
      sentAt: true,
      campaign: { select: { name: true } },
    },
  });

  return rows.map(({ campaign, ...row }) => ({
    ...row,
    campaignName: campaign?.name ?? null,
  }));
}

// -------------------------------- payment ----------------------------------

/**
 * Moves a broadcast to PAID once the gateway has verified the money.
 *
 * Runs inside the payment callback's transaction, so the payment and the
 * request settle together or not at all. Conditional on PENDING_PAYMENT, which
 * makes a duplicated callback a no-op rather than a second "paid" moment.
 */
export async function markBroadcastPaid(
  tx: Prisma.TransactionClient,
  broadcastId: string,
  at: Date,
): Promise<boolean> {
  const { count } = await tx.smsBroadcast.updateMany({
    where: { id: broadcastId, status: "PENDING_PAYMENT" },
    data: { status: "PAID", paidAt: at },
  });
  return count === 1;
}

// ------------------------------- admin queue -------------------------------

export interface QueuedBroadcast {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  campaignName: string | null;
  audience: string;
  body: string;
  recipientCount: number;
  smsParts: number;
  amount: number;
  status: SmsBroadcastStatus;
  createdAt: Date;
  paidAt: Date | null;
  sentAt: Date | null;
  canceledAt: Date | null;
  /** Gateway that settled it, e.g. `zarinpal`, or null if unpaid. */
  paymentProvider: string | null;
  paymentRefId: string | null;
  /** False when the money came through the mock gateway — nothing was paid. */
  paymentIsReal: boolean;
}

/**
 * The admin queue, across every venue.
 *
 * Paid-and-waiting first, oldest payment first: the queue is worked from the
 * top, and the venue that paid longest ago is the one to send next. Pending
 * checkouts are excluded — nothing has been paid, so there is nothing for staff
 * to do about them.
 */
export async function listBroadcastQueue(
  status: SmsBroadcastStatus | "OPEN" = "OPEN",
  take = 200,
): Promise<QueuedBroadcast[]> {
  const where: Prisma.SmsBroadcastWhereInput =
    status === "OPEN" ? { status: "PAID" } : { status };

  const rows = await prisma.smsBroadcast.findMany({
    where,
    orderBy:
      status === "OPEN" || status === "PAID" ? { paidAt: "asc" } : { updatedAt: "desc" },
    take,
    select: {
      id: true,
      restaurantId: true,
      audience: true,
      body: true,
      recipientCount: true,
      smsParts: true,
      amount: true,
      status: true,
      createdAt: true,
      paidAt: true,
      sentAt: true,
      canceledAt: true,
      restaurant: { select: { name: true, slug: true } },
      campaign: { select: { name: true } },
      payments: {
        where: { status: "PAID" },
        orderBy: { verifiedAt: "desc" },
        take: 1,
        select: { provider: true, refId: true },
      },
    },
  });

  return rows.map(({ restaurant, campaign, payments, ...row }) => {
    const payment = payments[0] ?? null;
    return {
      ...row,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      campaignName: campaign?.name ?? null,
      paymentProvider: payment?.provider ?? null,
      paymentRefId: payment?.refId ?? null,
      paymentIsReal: isRealPayment(payment?.provider),
    };
  });
}

/** Everything the download needs, or null when there is no such broadcast. */
export async function getBroadcastRecipients(id: string) {
  return prisma.smsBroadcast.findUnique({
    where: { id },
    select: {
      id: true,
      restaurantId: true,
      status: true,
      recipients: true,
      recipientCount: true,
      restaurant: { select: { slug: true } },
    },
  });
}

export type MoveResult =
  | { ok: true; from: SmsBroadcastStatus; to: SmsBroadcastStatus; restaurantId: string }
  | { ok: false; error: "NOT_FOUND" | "INVALID_TRANSITION" };

/**
 * Staff marking a broadcast sent, or refusing it.
 *
 * The status check and the write are one conditional update, so two admins
 * clicking at once cannot both succeed — the second finds the row no longer in
 * the state it expected and is told so.
 */
export async function moveBroadcast(
  id: string,
  to: SmsBroadcastStatus,
  now: Date = new Date(),
): Promise<MoveResult> {
  const current = await prisma.smsBroadcast.findUnique({
    where: { id },
    select: { status: true, restaurantId: true },
  });
  if (!current) return { ok: false, error: "NOT_FOUND" };

  const from = current.status as SmsBroadcastStatus;
  if (!staffCanMove(from, to)) return { ok: false, error: "INVALID_TRANSITION" };

  const { count } = await prisma.smsBroadcast.updateMany({
    where: { id, status: from },
    data: {
      status: to,
      ...(to === "SENT" ? { sentAt: now } : {}),
      ...(to === "CANCELED" ? { canceledAt: now } : {}),
    },
  });
  if (count !== 1) return { ok: false, error: "INVALID_TRANSITION" };

  return { ok: true, from, to, restaurantId: current.restaurantId };
}
