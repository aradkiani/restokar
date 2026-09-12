import { ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { getPlatformRevenue } from "@/lib/admin";

export const runtime = "nodejs";

/** Platform-wide revenue. Admin-only — this is the business's own P&L. */
export const GET = route(async () => {
  await requireAdmin();
  return ok(await getPlatformRevenue());
});
