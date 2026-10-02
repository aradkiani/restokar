import { fail, ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { PlanEditSchema } from "@/lib/plan-edit";
import { updatePlan } from "@/lib/plan-admin-server";

export const runtime = "nodejs";

/**
 * Saves a plan. The whole editable state is sent and re-validated here; the
 * form's own checks are a convenience. A new price applies to purchases and
 * renewals from now on — existing subscribers keep what they paid for until
 * their period ends.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const limit = await rateLimit(`admin:plan:${admin.id}:${clientIp(request)}`, {
    limit: 60,
    windowSeconds: 300,
  });
  if (!limit.allowed) return fail(429, "Too many attempts", "RATE_LIMITED");

  const input = await parseBody(request, PlanEditSchema);
  const result = await updatePlan(id, input, admin, clientIp(request));

  if (!result.ok) {
    return result.reason === "NOT_FOUND"
      ? fail(404, "پلن پیدا نشد", "NOT_FOUND")
      : fail(
          409,
          "این پلن در این فاصله ویرایش شده است. صفحه را تازه کنید و دوباره تغییر دهید.",
          "PLAN_CHANGED",
        );
  }
  return ok({ version: result.version, changed: result.changes.length });
});
