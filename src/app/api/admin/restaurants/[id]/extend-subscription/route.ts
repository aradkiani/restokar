import { ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { extendSubscription } from "@/lib/subscription-extension";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/api";
import { ExtendSubscriptionSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Grants subscription time by hand.
 *
 * The only admin endpoint that writes, so it carries the most protection:
 * requireAdmin() for authorization, a rate limit to blunt a compromised admin
 * session, and a SubscriptionExtension row capturing who did it and why.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();

    const limit = await rateLimit(`admin:extend:${admin.id}:${clientIp(request)}`, {
      limit: 30,
      windowSeconds: 300,
    });
    if (!limit.allowed) {
      return fail(429, "Too many attempts", "RATE_LIMITED");
    }

    const { id } = await context.params;
    const input = await parseBody(request, ExtendSubscriptionSchema);

    const result = await extendSubscription({
      restaurantId: id,
      admin: { id: admin.id, email: admin.email, role: "SUPER_ADMIN" },
      days: input.days,
      extensionType: input.extensionType,
      reason: input.reason,
    });

    return ok(result);
  },
);
