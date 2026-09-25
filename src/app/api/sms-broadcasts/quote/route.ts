import { ok, parseBody, route } from "@/lib/api";
import { requireOwner } from "@/lib/auth/guards";
import { SMS_CHECKOUT_ENABLED } from "@/lib/features";
import { buildBroadcast } from "@/lib/sms-broadcast-server";
import { SmsBroadcastSchema } from "@/lib/validation";
import { broadcastError } from "../errors";

export const runtime = "nodejs";

/**
 * What a promotional SMS would cost, while the owner is still writing it.
 *
 * Feeds the live price on the composer. **Counts only** — the response carries
 * how many numbers, never which: the list exists only on the server and, once
 * paid for, only in front of platform staff.
 *
 * A text problem (a link, too long) is returned inside the quote rather than as
 * an error, so the composer can show the price and the problem together while
 * the owner types. Only an unknown campaign is an error.
 */
export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const input = await parseBody(request, SmsBroadcastSchema);

  const built = await buildBroadcast(restaurantId, input);
  if (!built.ok) throw broadcastError(built.error);

  const {
    body,
    characters,
    encoding,
    parts,
    recipientCount,
    pricePerPart,
    amount,
    issue,
  } = built.quote;

  return ok({
    body,
    characters,
    encoding,
    parts,
    recipientCount,
    pricePerPart,
    amount,
    issue,
    audience: built.audience,
    campaignName: built.campaign?.name ?? null,
    checkoutEnabled: SMS_CHECKOUT_ENABLED,
  });
});
