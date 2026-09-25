import { ok, parseBody, route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { HttpError, requireAdmin } from "@/lib/auth/guards";
import { moveBroadcast } from "@/lib/sms-broadcast-server";
import { SmsBroadcastStatusSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Platform staff closing out a paid broadcast: sent, or refused.
 *
 * `requireAdmin` and no tenant scoping — the queue is the one place that reads
 * across venues, like the support inbox. The only moves accepted are the two in
 * `STAFF_MOVES`; PAID is written by the payment callback and nothing else.
 *
 * Marking a broadcast SENT is a statement that staff sent it with the external
 * tool. Nothing is sent from here.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { id } = await (context as Context).params;
  const { status } = await parseBody(request, SmsBroadcastStatusSchema);

  const result = await moveBroadcast(id, status);
  if (!result.ok) {
    if (result.error === "NOT_FOUND") {
      throw new HttpError(404, "Broadcast not found", "SMS_BROADCAST_NOT_FOUND");
    }
    // Already sent, already refused, or not yet paid — including the second of
    // two admins pressing the same button.
    throw new HttpError(
      409,
      "That status change is not allowed",
      "SMS_BROADCAST_INVALID_TRANSITION",
    );
  }

  await recordAudit({
    actor: admin,
    restaurantId: result.restaurantId,
    action: "SMS_BROADCAST_STATUS_CHANGED",
    summary:
      result.to === "SENT"
        ? "پیامک تبلیغاتی توسط پشتیبانی ارسال شد"
        : "درخواست پیامک تبلیغاتی توسط پشتیبانی لغو شد",
    entityType: "SmsBroadcast",
    entityId: id,
    metadata: { from: result.from, to: result.to },
  });

  return ok({ id, status: result.to });
});
