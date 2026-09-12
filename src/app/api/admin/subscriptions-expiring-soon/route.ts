import { ok, parseQuery, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { getExpiringSubscriptions } from "@/lib/admin";
import { EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { z } from "zod";

export const runtime = "nodejs";

const QuerySchema = z.object({
  withinDays: z.coerce.number().int().min(1).max(120).default(EXPIRY_WARNING_DAYS),
});

/** Subscriptions nearing expiry, so staff can reach out before one lapses. */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const { withinDays } = parseQuery(request, QuerySchema);
  return ok(await getExpiringSubscriptions(withinDays));
});
