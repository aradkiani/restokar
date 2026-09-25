import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { getRetentionOverview, listCustomers } from "@/lib/customers-server";
import { CustomerList } from "./list";

export const metadata: Metadata = { title: "مشتریان" };
export const dynamic = "force-dynamic";

/**
 * The customer book.
 *
 * Owner-only, like settings and the subscription: this is the most personal
 * data the platform holds, and the codebase's rule is that a section not listed
 * in `STAFF_TABS` stays closed rather than being opened by default.
 *
 * The first page is rendered on the server so the screen arrives with data
 * rather than a spinner; the client component takes over for filtering.
 */
export default async function CustomersPage() {
  const { restaurantId } = await requirePageOwner("/dashboard");
  const { locale } = await getI18n();

  const [initial, overview] = await Promise.all([
    listCustomers(restaurantId, {}),
    getRetentionOverview(restaurantId),
  ]);

  return (
    <CustomerList
      locale={locale}
      initial={{
        ...initial,
        // Dates cannot cross the server/client boundary as props, so the whole
        // page is serialised once here rather than at each use site.
        customers: initial.customers.map((customer) => ({
          ...customer,
          firstOrderAt: customer.firstOrderAt?.toISOString() ?? null,
          lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
        })),
        summary: overview.summary,
        opportunities: overview.opportunities,
      }}
      segments={overview.segments}
    />
  );
}
