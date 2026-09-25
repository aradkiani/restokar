import { route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { HttpError, requireAdmin } from "@/lib/auth/guards";
import { clientIp } from "@/lib/rate-limit";
import { recipientsFileContent, recipientsFileName } from "@/lib/sms-broadcast";
import { getBroadcastRecipients } from "@/lib/sms-broadcast-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * The recipient file for one paid broadcast, for staff to upload to the
 * sending tool.
 *
 * **The only endpoint in the product that returns a list of customer phone
 * numbers**, which is why it is admin-only, refuses anything not yet paid, and
 * writes a DATA_EXPORTED entry to the venue's own audit log every time. A venue
 * asking "who has a copy of our customers' numbers, and when did they take it"
 * gets an answer that includes us.
 *
 * Refused before payment: an unpaid request is a price quote, and a price quote
 * is not a reason for anybody to hold the list. Still downloadable once SENT or
 * CANCELED, because a failed send has to be retried and a dispute has to be
 * checkable against what was actually sent.
 */
export const GET = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { id } = await (context as Context).params;

  const broadcast = await getBroadcastRecipients(id);
  if (!broadcast) {
    throw new HttpError(404, "Broadcast not found", "SMS_BROADCAST_NOT_FOUND");
  }
  if (broadcast.status === "PENDING_PAYMENT") {
    throw new HttpError(
      409,
      "This broadcast has not been paid for",
      "SMS_BROADCAST_UNPAID",
    );
  }

  await recordAudit({
    actor: admin,
    restaurantId: broadcast.restaurantId,
    action: "DATA_EXPORTED",
    summary: `فهرست ${broadcast.recipientCount} گیرندهٔ پیامک تبلیغاتی توسط پشتیبانی دریافت شد`,
    entityType: "SmsBroadcast",
    entityId: broadcast.id,
    metadata: { dataset: "smsRecipients", rows: broadcast.recipientCount },
    ip: clientIp(request),
  });

  return new Response(recipientsFileContent(broadcast.recipients), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${recipientsFileName(broadcast.id, broadcast.restaurant.slug)}"`,
      // Customer phone numbers behind a session cookie: never cached anywhere,
      // for the same reason the export route gives.
      "cache-control": "no-store, private",
    },
  });
});
