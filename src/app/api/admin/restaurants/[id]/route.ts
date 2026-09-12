import { fail, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { getRestaurantForAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/** Full admin view of one restaurant. Admin-only; see requireAdmin(). */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireAdmin();

    const { id } = await context.params;
    const restaurant = await getRestaurantForAdmin(id);

    if (!restaurant) {
      return fail(404, "Restaurant not found", "NOT_FOUND");
    }

    return ok(restaurant);
  },
);
