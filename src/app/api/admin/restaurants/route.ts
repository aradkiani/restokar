import { ok, parseQuery, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { listRestaurantsForAdmin } from "@/lib/admin";
import { AdminRestaurantQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Platform-wide restaurant list.
 *
 * requireAdmin() is the whole security boundary: it throws 403 for OWNER and
 * STAFF, so a restaurant user calling this directly gets nothing regardless of
 * what the UI does or does not render for them.
 */
export const GET = route(async (request: Request) => {
  await requireAdmin();

  const query = parseQuery(request, AdminRestaurantQuerySchema);

  const rows = await listRestaurantsForAdmin({
    search: query.search,
    status: query.status,
    plan: query.plan,
    sort: query.sort,
    direction: query.direction,
    registeredAfter: query.registeredAfter
      ? new Date(`${query.registeredAfter}T00:00:00`)
      : undefined,
  });

  return ok(rows);
});
