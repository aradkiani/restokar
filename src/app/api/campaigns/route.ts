import { ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireOwner } from "@/lib/auth/guards";
import { CampaignQuerySchema, CampaignSchema } from "@/lib/validation";
import { createCampaign, listCampaigns } from "@/lib/campaigns-server";
import { recordAudit } from "@/lib/audit";
import { campaignError } from "./errors";

export const runtime = "nodejs";

/**
 * A venue's marketing campaigns.
 *
 * Behind `requireOwner`, like the customer book it targets. The codebase's rule
 * is that a section absent from `STAFF_TABS` stays closed — the safe direction
 * to fail — and a campaign is a statement about a venue's customers, which is
 * the most personal data the platform holds. It is also chain-level: campaigns
 * belong to the menu owner, so a branch manager has no venue-scoped view of
 * them to be given.
 *
 * The tenant comes from the session. There is no `restaurantId` parameter, so
 * there is nothing for a caller to point at somebody else's venue.
 *
 * **Nothing in this API sends a message.** There is no delivery endpoint, and
 * no code path reachable from here makes an outbound call.
 */
export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const query = parseQuery(request, CampaignQuerySchema);

  return ok(await listCampaigns(restaurantId, query));
});

/**
 * Plans a new campaign. Always created as a DRAFT.
 *
 * Scheduling and activation are transitions rather than creation options, so
 * every state is entered through the one path the state machine guards.
 */
export const POST = route(async (request: Request) => {
  const { user, restaurantId } = await requireOwner();
  const input = await parseBody(request, CampaignSchema);

  const result = await createCampaign(restaurantId, user.id, input);
  if (!result.ok) throw campaignError(result.error);

  await recordAudit({
    actor: user,
    restaurantId,
    action: "CAMPAIGN_CREATED",
    summary: `کمپین «${result.campaign.name}» ساخته شد`,
    entityType: "Campaign",
    entityId: result.campaign.id,
    // Segment and counts only. An audit log is read by more people than the
    // campaign screen, and nothing here needs to identify a single guest.
    metadata: {
      targetSegment: result.campaign.targetSegment,
      productId: result.campaign.productId,
      categoryId: result.campaign.categoryId,
    },
  });

  return ok(result.campaign, { status: 201 });
});
