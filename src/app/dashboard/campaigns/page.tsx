import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { listCampaigns } from "@/lib/campaigns-server";
import { prisma } from "@/lib/prisma";
import { CampaignManager } from "./manager";

export const metadata: Metadata = { title: "کمپین‌ها" };
export const dynamic = "force-dynamic";

/**
 * Campaign planning.
 *
 * Owner-only, like the customer book it targets: the codebase's rule is that a
 * section not listed in `STAFF_TABS` stays closed rather than being opened by
 * default, and a campaign is a statement about a venue's customers.
 *
 * The first page is rendered on the server so the screen arrives with data
 * rather than a spinner; the client component takes over for filtering and
 * editing. Products and categories come along for the context selects — both
 * are small per venue and the alternative is a request the moment the form
 * opens.
 */
export default async function CampaignsPage() {
  const { restaurantId } = await requirePageOwner("/dashboard");
  const { locale } = await getI18n();

  const [initial, products, categories] = await Promise.all([
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
  ]);

  return (
    <CampaignManager
      locale={locale}
      products={products}
      categories={categories}
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
