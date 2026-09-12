import { ok, parseBody, route } from "@/lib/api";
import { requireOwner } from "@/lib/auth/guards";
import { CampaignStatusSchema } from "@/lib/validation";
import { changeCampaignStatus } from "@/lib/campaigns-server";
import { recordAudit } from "@/lib/audit";
import { campaignError } from "../../errors";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Moves a campaign between states: schedule, activate, pause, complete, cancel.
 *
 * The **only** way a status ever changes. The state being moved *from* is read
 * from the row rather than taken from the request, so a stale tab cannot talk
 * the server into a transition that is not actually available, and the move is
 * checked against `CAMPAIGN_TRANSITIONS` server-side. The dashboard hides
 * buttons it knows are unavailable; that is a convenience, not the guard.
 *
 * **No message is sent by any of these transitions.** `ACTIVE` means the
 * campaign is logically running — there is no delivery system for it to drive.
 */
export const POST = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;

  const { status } = await parseBody(request, CampaignStatusSchema);

  const result = await changeCampaignStatus(restaurantId, id, status);
  if (!result.ok) throw campaignError(result.error);

  await recordAudit({
    actor: user,
    restaurantId,
    action: "CAMPAIGN_STATUS_CHANGED",
    summary: `وضعیت کمپین «${result.campaign.name}» به ${status} تغییر کرد`,
    entityType: "Campaign",
    entityId: result.campaign.id,
    // The before/after that makes this line worth reading, plus the audience
    // size recorded at the moment of commitment. Counts, never identities.
    metadata: {
      from: result.previousStatus ?? null,
      to: status,
      audienceSnapshotSize: result.campaign.audienceSnapshotSize,
      audienceSnapshotEligible: result.campaign.audienceSnapshotEligible,
    },
  });

  return ok(result.campaign);
});
