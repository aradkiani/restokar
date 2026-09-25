import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import { listBroadcastQueue } from "@/lib/sms-broadcast-server";
import { SmsQueue, type QueueFilter } from "./queue";

export const metadata: Metadata = { title: "پیامک‌ها" };
export const dynamic = "force-dynamic";

const FILTERS: Record<QueueFilter, "OPEN" | "SENT" | "CANCELED"> = {
  open: "OPEN",
  sent: "SENT",
  canceled: "CANCELED",
};

/**
 * The promotional SMS queue: every paid broadcast, across every venue.
 *
 * This is where a venue's purchase turns into a message. Staff download the
 * recipient file, send the text with the external SMS tool, and mark it sent.
 * The application itself never sends a broadcast.
 *
 * No guard here on purpose — `/admin/layout.tsx` runs `requirePageAdmin()`
 * before any page in this folder renders. The recipient list itself is never
 * rendered into this page; it only leaves through the audited download route.
 */
export default async function AdminSmsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await getI18n();
  const { status } = await searchParams;

  const filter: QueueFilter =
    status === "sent" || status === "canceled" ? status : "open";

  const rows = await listBroadcastQueue(FILTERS[filter]);

  return (
    <SmsQueue
      key={filter}
      locale={locale}
      filter={filter}
      initialRows={rows.map((row) => ({
        id: row.id,
        restaurantName: row.restaurantName,
        restaurantSlug: row.restaurantSlug,
        campaignName: row.campaignName,
        audience: row.audience,
        body: row.body,
        recipientCount: row.recipientCount,
        smsParts: row.smsParts,
        amount: row.amount,
        status: row.status,
        paidAt: row.paidAt?.toISOString() ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        canceledAt: row.canceledAt?.toISOString() ?? null,
        paymentRefId: row.paymentRefId,
        paymentIsReal: row.paymentIsReal,
      }))}
    />
  );
}
