import { ok, route } from "@/lib/api";
import { requireOwner } from "@/lib/auth/guards";
import { CustomerQuerySchema } from "@/lib/validation";
import { getRetentionOverview, listCustomers } from "@/lib/customers-server";

export const runtime = "nodejs";

/**
 * A venue's customer book.
 *
 * Behind `requireOwner`, not a staff grant. The codebase's own rule is that a
 * section which is not listed in `STAFF_TABS` stays closed until someone adds
 * it — the safe direction to fail — and this one reads guests' phone numbers,
 * which is the most personal data the platform holds. It is also chain-level:
 * customers belong to the menu owner, so a branch manager has no venue-scoped
 * view of them to be given.
 *
 * The tenant comes from the session. There is no `restaurantId` parameter to
 * supply, so there is nothing for a caller to point somewhere else.
 */
export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = CustomerQuerySchema.parse(params);

  const [result, overview] = await Promise.all([
    listCustomers(restaurantId, query),
    getRetentionOverview(restaurantId),
  ]);

  /*
    The overview travels with every page, not just the first.

    It is the same two queries the list already makes, and the tiles and action
    cards sit above a table the owner is filtering — recomputing them alongside
    is what stops "۱۸ at risk" going stale the moment they page or search.
  */
  return ok({
    ...result,
    segments: overview.segments,
    summary: overview.summary,
    opportunities: overview.opportunities,
  });
});
