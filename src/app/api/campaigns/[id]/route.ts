import { ok, parseBody, route } from "@/lib/api";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { CampaignSchema } from "@/lib/validation";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/campaigns-server";
import { recordAudit } from "@/lib/audit";
import { campaignError } from "../errors";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * One campaign, with a freshly evaluated audience.
 *
 * Scoped by the session's tenant as well as the id, so an id belonging to
 * another venue is a 404 rather than a disclosure — the rule every other `[id]`
 * route here follows.
 *
 * The audience is returned as **counts only**. There is no endpoint in this
 * feature that lists the customers behind the number.
 */
export const GET = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;

  const campaign = await getCampaign(restaurantId, id);
  if (!campaign) throw new HttpError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");

  return ok(campaign);
});

/**
 * Changes a campaign's configuration.
 *
 * Refused unless it is still a plan — see `isEditable`. Status is deliberately
 * *not* accepted here: a state change goes through the status route, where the
 * transition table is applied.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;

  const input = await parseBody(request, CampaignSchema);

  const result = await updateCampaign(restaurantId, id, input);
  if (!result.ok) throw campaignError(result.error);

  await recordAudit({
    actor: user,
    restaurantId,
    action: "CAMPAIGN_UPDATED",
    summary: `کمپین «${result.campaign.name}» ویرایش شد`,
    entityType: "Campaign",
    entityId: result.campaign.id,
    metadata: {
      targetSegment: result.campaign.targetSegment,
      productId: result.campaign.productId,
      categoryId: result.campaign.categoryId,
    },
  });

  return ok(result.campaign);
});

/**
 * Discards a draft.
 *
 * Drafts only. A campaign that was ever committed to is a record of a decision;
 * cancelling it keeps that record, deleting it would erase it.
 */
export const DELETE = route(async (_request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;

  const existing = await getCampaign(restaurantId, id);
  if (!existing) throw new HttpError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");

  const result = await deleteCampaign(restaurantId, id);
  if (!result.ok) throw campaignError(result.error);

  await recordAudit({
    actor: user,
    restaurantId,
    action: "CAMPAIGN_UPDATED",
    summary: `پیش‌نویس کمپین «${existing.name}» حذف شد`,
    entityType: "Campaign",
    entityId: id,
    metadata: { deleted: true },
  });

  return ok({ id });
});
