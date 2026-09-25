import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { listCampaigns } from "@/lib/campaigns-server";
import { listVenueBroadcasts } from "@/lib/sms-broadcast-server";
import { prisma } from "@/lib/prisma";
import { CampaignManager } from "./manager";

export const metadata: Metadata = { title: "کمپین‌ها" };
export const dynamic = "force-dynamic";

/**
 * Campaign planning, and buying promotional SMS for a campaign's audience.
 *
 * Owner-only, like the customer book it targets: the codebase's rule is that a
 * section not listed in `STAFF_TABS` stays closed rather than being opened by
 * default, and a campaign is a statement about a venue's customers. Buying an
 * SMS is also spending the venue's money, which is an owner's decision.
 *
 * The first page is rendered on the server so the screen arrives with data
 * rather than a spinner; the client component takes over for filtering and
 * editing. Products and categories come along for the context selects — both
 * are small per venue and the alternative is a request the moment the form
 * opens.
 *
 * `?payment=` is how the gateway callback returns the owner after paying for a
 * broadcast. It only chooses which notice to show — whether the money arrived
 * is decided by the callback, and the history below is read from the database.
 */
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { restaurantId } = await requirePageOwner("/dashboard");
  const { locale } = await getI18n();
  const { payment } = await searchParams;

  const [initial, products, categories, broadcasts] = await Promise.all([
    listCampaigns(restaurantId, {}),
    prisma.product.findMany({
      where: { restaurantId },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    listVenueBroadcasts(restaurantId),
  ]);

  return (
    <CampaignManager
      locale={locale}
      products={products}
      categories={categories}
      paymentOutcome={payment === "success" || payment === "failed" ? payment : null}
      broadcasts={broadcasts.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        paidAt: row.paidAt?.toISOString() ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
      }))}
      initial={{
        ...initial,
        // Dates cannot cross the server/client boundary as props, so the page
        // is serialised once here rather than at each use site.
        campaigns: initial.campaigns.map((campaign) => ({
          ...campaign,
          startsAt: campaign.startsAt?.toISOString() ?? null,
          endsAt: campaign.endsAt?.toISOString() ?? null,
          audienceSnapshotAt: campaign.audienceSnapshotAt?.toISOString() ?? null,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
        })),
      }}
    />
  );
}
