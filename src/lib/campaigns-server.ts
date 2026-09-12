import "server-only";
import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  CAMPAIGN_TRANSITIONS,
  DEFAULT_CAMPAIGN_PAGE_SIZE,
  MAX_CAMPAIGN_PAGE_SIZE,
  canTransition,
  capturesAudience,
  isEditable,
  scheduleIssue,
  summariseAudience,
  type AudienceCandidate,
  type AudienceEstimate,
  type CampaignScheduleIssue,
  type CampaignStatus,
} from "./campaigns";
import type { CustomerSegment } from "./customers";

/**
 * The database half of campaigns. The rules are in `campaigns.ts`, which stays
 * pure; this is tenant scoping, audience aggregation and persistence.
 *
 * Three things every function here holds to:
 *
 *   * **The tenant comes from the session.** Every read and every write is
 *     scoped to a `restaurantId` the caller proved they own, never one they
 *     supplied. A product or category id from another venue is simply not found
 *     under that scope, so it is refused rather than silently accepted.
 *   * **Audience counting happens in SQL; audience *rules* do not.** The
 *     database groups orders per customer; `summariseAudience` — and through it
 *     `resolveSegment` — decides who is loyal or at risk. Restating those
 *     thresholds in SQL would give the customer book and the campaign screen
 *     two answers that drift apart.
 *   * **Nothing is ever sent.** No module reachable from here has a delivery
 *     path, and `campaigns.test.ts` asserts the source text of every campaign
 *     module against that.
 *
 * ### Dynamic audience, snapshotted size
 *
 * A segment is a function of recency — a guest becomes "at risk" by doing
 * nothing for thirty days — so any stored recipient list is wrong by the next
 * morning. The audience is therefore always **evaluated live** at read time.
 *
 * What *is* stored is the pair of integers the owner was looking at when they
 * committed to the campaign, written when it enters SCHEDULED or ACTIVE. That
 * keeps the decision auditable without materialising one row per targeted guest
 * — a recipient table would cost a row per customer per campaign and buy
 * nothing while nothing can be delivered.
 */

/**
 * Orders that count, matching `COUNTED` in `customers-server.ts` and `analytics.ts`.
 * A cancelled order is not a sale, and a refund is recorded on a cancelled one.
 */
const COUNTED_STATUS = Prisma.sql`o."status" <> 'CANCELED'`;

// -------------------------------- audience ---------------------------------

export interface CampaignContext {
  productId?: string | null;
  categoryId?: string | null;
}

export interface AudienceFilter extends CampaignContext {
  segment: CustomerSegment;
}

/**
 * Narrows the audience to guests who actually bought the thing.
 *
 * An `EXISTS` rather than a join on the outer query: a customer who ordered the
 * dish nine times should be counted once, and their segment must still be
 * computed from their *whole* history rather than from the subset that matched.
 * Who they are is a fact about all their visits; the context only decides
 * whether they are asked about at all.
 *
 * `OrderItem.productId` is nullable — deleting a dish nulls it rather than
 * destroying order history — so a context pointing at a since-deleted product
 * matches nothing and the audience honestly falls to zero.
 */
function contextFilter(context: CampaignContext): Prisma.Sql {
  const predicates: Prisma.Sql[] = [];

  if (context.productId) predicates.push(Prisma.sql`p."id" = ${context.productId}`);
  if (context.categoryId) {
    predicates.push(Prisma.sql`p."categoryId" = ${context.categoryId}`);
  }

  if (predicates.length === 0) return Prisma.empty;

  return Prisma.sql`
    AND EXISTS (
      SELECT 1
        FROM "Order" o2
        JOIN "OrderItem" oi ON oi."orderId" = o2."id"
        JOIN "Product" p   ON p."id" = oi."productId"
       WHERE o2."customerId" = c."id"
         AND o2."status" <> 'CANCELED'
         AND ${Prisma.join(predicates, " AND ")}
    )`;
}

/**
 * The four fields the segment rules need, per customer, computed by the database.
 *
 * **No identity leaves this query.** `phone` is selected to answer "is there a
 * contact method at all" and is reduced to a boolean by `summariseAudience`
 * before anything else sees it; no name, no id and no number reaches a caller,
 * a response body or a log line.
 *
 * A `LEFT JOIN` so a customer with no counted orders comes back with a count of
 * zero rather than disappearing — they are a real `new` customer, and dropping
 * them would understate that segment.
 *
 * One query for the whole audience, so nothing here is N+1. It does read one
 * small row per customer of the venue, which is the same bound
 * `getSegmentCounts` already accepts and for the same reason: "days since" is
 * not something an index can answer, and pushing the thresholds into SQL would
 * put the segment rules in two places.
 */
async function audienceCandidates(
  restaurantId: string,
  context: CampaignContext,
): Promise<AudienceCandidate[]> {
  const rows = await prisma.$queryRaw<
    {
      phone: string | null;
      marketingConsent: boolean;
      orderCount: number;
      lastOrderAt: Date | null;
    }[]
  >`
    SELECT c."phone",
           c."marketingConsent",
           COUNT(o."id")::int AS "orderCount",
           MAX(o."placedAt")  AS "lastOrderAt"
      FROM "Customer" c
      LEFT JOIN "Order" o
        ON o."customerId" = c."id"
       AND ${COUNTED_STATUS}
     WHERE c."restaurantId" = ${restaurantId}
       ${contextFilter(context)}
     GROUP BY c."id", c."phone", c."marketingConsent"
  `;

  return rows;
}

/**
 * How many customers this campaign would target, and how many are reachable.
 *
 * Aggregate counts only — the whole return value is two integers. An owner
 * planning a campaign needs to know the size of the group, not who is in it,
 * and there is no endpoint in this feature that returns a customer list.
 */
export async function estimateAudience(
  restaurantId: string,
  filter: AudienceFilter,
  now: Date = new Date(),
): Promise<AudienceEstimate> {
  const candidates = await audienceCandidates(restaurantId, filter);
  return summariseAudience(candidates, filter.segment, now);
}

// --------------------------------- reading ---------------------------------

export interface CampaignRecord {
  id: string;
  name: string;
  status: CampaignStatus;
  targetSegment: CustomerSegment;
  productId: string | null;
  productName: string | null;
  /** Surfaced so the preview can say the dish is also being promoted. */
  productIsFeatured: boolean;
  categoryId: string | null;
  categoryName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  audienceSnapshotSize: number | null;
  audienceSnapshotEligible: number | null;
  audienceSnapshotAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignDetail extends CampaignRecord {
  /** Evaluated live, never read from the snapshot. */
  audience: AudienceEstimate;
  allowedTransitions: CampaignStatus[];
  editable: boolean;
}

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  status: true,
  targetSegment: true,
  productId: true,
  categoryId: true,
  startsAt: true,
  endsAt: true,
  audienceSnapshotSize: true,
  audienceSnapshotEligible: true,
  audienceSnapshotAt: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { name: true, isFeatured: true } },
  category: { select: { name: true } },
} as const;

type CampaignRow = Prisma.CampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

function toRecord(row: CampaignRow): CampaignRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    targetSegment: row.targetSegment as CustomerSegment,
    productId: row.productId,
    productName: row.product?.name ?? null,
    productIsFeatured: row.product?.isFeatured ?? false,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    audienceSnapshotSize: row.audienceSnapshotSize,
    audienceSnapshotEligible: row.audienceSnapshotEligible,
    audienceSnapshotAt: row.audienceSnapshotAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CampaignListQuery {
  status?: CampaignStatus;
  page?: number;
  pageSize?: number;
}

export interface CampaignListResult {
  campaigns: CampaignRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * A venue's campaigns, newest first.
 *
 * The list deliberately carries the **snapshot** rather than a live audience
 * estimate: a live figure per row would be one aggregation query per campaign,
 * which is the N+1 this feature is otherwise careful to avoid. Live estimates
 * belong on the single-campaign screen, where there is exactly one to compute.
 */
export async function listCampaigns(
  restaurantId: string,
  query: CampaignListQuery,
): Promise<CampaignListResult> {
  const pageSize = Math.min(
    query.pageSize ?? DEFAULT_CAMPAIGN_PAGE_SIZE,
    MAX_CAMPAIGN_PAGE_SIZE,
  );
  const page = Math.max(1, query.page ?? 1);

  const where: Prisma.CampaignWhereInput = {
    // From the session, never the request.
    restaurantId,
    ...(query.status ? { status: query.status } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CAMPAIGN_SELECT,
    }),
  ]);

  return {
    campaigns: rows.map((row) => toRecord(row as CampaignRow)),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * One campaign, with a freshly evaluated audience.
 *
 * Scoped by `restaurantId` as well as the id, so a guessed id from another
 * venue is a 404 rather than a disclosure — the rule every `[id]` read in this
 * codebase follows.
 */
export async function getCampaign(
  restaurantId: string,
  campaignId: string,
  now: Date = new Date(),
): Promise<CampaignDetail | null> {
  const row = await prisma.campaign.findFirst({
    where: { id: campaignId, restaurantId },
    select: CAMPAIGN_SELECT,
  });

  if (!row) return null;

  return detailFor(restaurantId, row as CampaignRow, now);
}

async function detailFor(
  restaurantId: string,
  row: CampaignRow,
  now: Date,
): Promise<CampaignDetail> {
  const record = toRecord(row);

  const audience = await estimateAudience(
    restaurantId,
    {
      segment: record.targetSegment,
      productId: record.productId,
      categoryId: record.categoryId,
    },
    now,
  );

  return {
    ...record,
    audience,
    allowedTransitions: [...CAMPAIGN_TRANSITIONS[record.status]],
    editable: isEditable(record.status),
  };
}

// --------------------------------- writing ---------------------------------

export type CampaignWriteError =
  | "NOT_FOUND"
  | "NOT_EDITABLE"
  | "INVALID_TRANSITION"
  | "PRODUCT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | CampaignScheduleIssue;

export type CampaignWriteResult =
  | {
      ok: true;
      campaign: CampaignDetail;
      /** Set by `changeCampaignStatus`, so the audit line can say what moved. */
      previousStatus?: CampaignStatus;
    }
  | { ok: false; error: CampaignWriteError };

export type CampaignDeleteResult =
  { ok: true } | { ok: false; error: CampaignWriteError };

export interface CampaignInput {
  name: string;
  targetSegment: CustomerSegment;
  productId?: string | null;
  categoryId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/**
 * Confirms the optional context belongs to this tenant.
 *
 * The cross-tenant guard for campaigns: an id is looked up *within* the
 * session's restaurant, so another venue's product is indistinguishable from a
 * nonexistent one. Nothing here trusts that the id came from our own form.
 */
async function contextError(
  restaurantId: string,
  context: CampaignContext,
): Promise<"PRODUCT_NOT_FOUND" | "CATEGORY_NOT_FOUND" | null> {
  if (context.productId) {
    const product = await prisma.product.findFirst({
      where: { id: context.productId, restaurantId },
      select: { id: true },
    });
    if (!product) return "PRODUCT_NOT_FOUND";
  }

  if (context.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: context.categoryId, restaurantId },
      select: { id: true },
    });
    if (!category) return "CATEGORY_NOT_FOUND";
  }

  return null;
}

/**
 * Creates a campaign. Always a DRAFT.
 *
 * Scheduling and activation are transitions rather than creation options, so
 * there is exactly one path into every state and it is the one the state
 * machine guards.
 */
export async function createCampaign(
  restaurantId: string,
  createdByUserId: string,
  input: CampaignInput,
  now: Date = new Date(),
): Promise<CampaignWriteResult> {
  const context = await contextError(restaurantId, input);
  if (context) return { ok: false, error: context };

  const issue = scheduleIssue("DRAFT", input, now);
  if (issue) return { ok: false, error: issue };

  const created = await prisma.campaign.create({
    data: {
      restaurantId,
      createdByUserId,
      name: input.name,
      status: "DRAFT",
      targetSegment: input.targetSegment,
      productId: input.productId ?? null,
      categoryId: input.categoryId ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    },
    select: CAMPAIGN_SELECT,
  });

  return {
    ok: true,
    campaign: await detailFor(restaurantId, created as CampaignRow, now),
  };
}

/**
 * Changes a campaign's configuration.
 *
 * Refused unless the campaign is still a plan. What a running campaign was set
 * up to do is a matter of record, and letting it be rewritten afterwards would
 * make the audit trail describe a campaign that never existed.
 *
 * The window is validated against the campaign's *current* status, so editing a
 * SCHEDULED campaign cannot leave it scheduled with no start date.
 */
export async function updateCampaign(
  restaurantId: string,
  campaignId: string,
  input: CampaignInput,
  now: Date = new Date(),
): Promise<CampaignWriteResult> {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, restaurantId },
    select: { id: true, status: true },
  });

  if (!existing) return { ok: false, error: "NOT_FOUND" };
  if (!isEditable(existing.status)) return { ok: false, error: "NOT_EDITABLE" };

  const context = await contextError(restaurantId, input);
  if (context) return { ok: false, error: context };

  const issue = scheduleIssue(existing.status, input, now);
  if (issue) return { ok: false, error: issue };

  const updated = await prisma.campaign.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      targetSegment: input.targetSegment,
      productId: input.productId ?? null,
      categoryId: input.categoryId ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    },
    select: CAMPAIGN_SELECT,
  });

  return {
    ok: true,
    campaign: await detailFor(restaurantId, updated as CampaignRow, now),
  };
}

/**
 * Moves a campaign between states.
 *
 * The only way a campaign's status ever changes. Every move is checked against
 * `CAMPAIGN_TRANSITIONS`, and the window is re-checked against the state being
 * entered — a draft with a lapsed end date may sit in the drawer, but it may
 * not be scheduled.
 *
 * Entering a committed state records the audience size at that moment. It is
 * two integers, not a recipient list; see the note at the top of this file.
 * Re-activating a paused campaign re-records it, with `audienceSnapshotAt`
 * saying when — the figure describes the latest commitment, not the first.
 */
export async function changeCampaignStatus(
  restaurantId: string,
  campaignId: string,
  to: CampaignStatus,
  now: Date = new Date(),
): Promise<CampaignWriteResult> {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, restaurantId },
    select: {
      id: true,
      status: true,
      targetSegment: true,
      productId: true,
      categoryId: true,
      startsAt: true,
      endsAt: true,
    },
  });

  if (!existing) return { ok: false, error: "NOT_FOUND" };
  if (!canTransition(existing.status, to)) {
    return { ok: false, error: "INVALID_TRANSITION" };
  }

  const issue = scheduleIssue(to, existing, now);
  if (issue) return { ok: false, error: issue };

  const snapshot = capturesAudience(to)
    ? await estimateAudience(
        restaurantId,
        {
          segment: existing.targetSegment as CustomerSegment,
          productId: existing.productId,
          categoryId: existing.categoryId,
        },
        now,
      )
    : null;

  const updated = await prisma.campaign.update({
    where: { id: existing.id },
    data: {
      status: to,
      ...(snapshot
        ? {
            audienceSnapshotSize: snapshot.estimatedAudience,
            audienceSnapshotEligible: snapshot.eligibleAudience,
            audienceSnapshotAt: now,
          }
        : {}),
    },
    select: CAMPAIGN_SELECT,
  });

  return {
    ok: true,
    campaign: await detailFor(restaurantId, updated as CampaignRow, now),
    previousStatus: existing.status,
  };
}

/**
 * Removes a campaign that was never committed to.
 *
 * Drafts only. A campaign that reached SCHEDULED or beyond is a record of a
 * decision — cancelling it keeps that record, deleting it would erase it.
 */
export async function deleteCampaign(
  restaurantId: string,
  campaignId: string,
): Promise<CampaignDeleteResult> {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, restaurantId },
    select: { id: true, status: true },
  });

  if (!existing) return { ok: false, error: "NOT_FOUND" };
  if (existing.status !== "DRAFT") return { ok: false, error: "NOT_EDITABLE" };

  await prisma.campaign.delete({ where: { id: existing.id } });
  return { ok: true };
}
