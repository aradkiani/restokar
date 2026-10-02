import "server-only";
import { prisma } from "./prisma";
import { netRevenue } from "./analytics";
import { DAY_MS } from "./constants";
import { COUNTED_ORDER } from "./order-status";

/**
 * Chain-wide reporting: one row per site, for the owner of a multi-branch venue.
 *
 * A third reporting layer beside `analytics.ts` (one restaurant) and
 * `admin.ts` (every tenant on the platform). It sits between them and is scoped
 * to exactly one chain — the parent and the branches that point at it — so a
 * chain owner sees their own sites and nothing else. Callers must have
 * established chain ownership via `requireChainOwner()` first; nothing here
 * checks it, exactly as `analytics.ts` does not re-check tenancy.
 *
 * Revenue uses the same `netRevenue()` the single-venue reports use, so a
 * branch's number here and the same branch's own finance screen cannot
 * disagree — tax and tips are excluded from both.
 */

export interface SiteSummary {
  id: string;
  name: string;
  slug: string;
  /** The head office, as opposed to one of its branches. */
  isHeadOffice: boolean;
  managerName: string | null;
  managerPhone: string | null;
  orders: number;
  revenue: number;
  expenses: number;
  net: number;
}

export interface ChainSummary {
  sites: SiteSummary[];
  totals: { orders: number; revenue: number; expenses: number; net: number };
  days: number;
}

export async function getChainSummary(
  parentRestaurantId: string,
  days = 30,
): Promise<ChainSummary> {
  const since = new Date(Date.now() - days * DAY_MS);

  const venues = await prisma.restaurant.findMany({
    where: {
      OR: [{ id: parentRestaurantId }, { parentRestaurantId }],
    },
    // Head office first. Postgres sorts NULLs last on ASC by default, which put
    // the parent — the only row with a null parent — at the bottom of its own
    // chain's table.
    orderBy: [
      { parentRestaurantId: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      name: true,
      slug: true,
      parentRestaurantId: true,
      members: {
        where: { role: "BRANCH_MANAGER" },
        select: { name: true, phone: true },
        take: 1,
      },
    },
  });

  const ids = venues.map((v) => v.id);

  // Two grouped queries rather than one per site: a chain with twenty branches
  // would otherwise fire forty round trips to render one table.
  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        restaurantId: { in: ids },
        ...COUNTED_ORDER,
        placedAt: { gte: since },
      },
      select: { restaurantId: true, total: true, tax: true, tip: true },
    }),
    prisma.expense.groupBy({
      by: ["restaurantId"],
      where: { restaurantId: { in: ids }, occurredAt: { gte: since } },
      _sum: { amount: true },
    }),
  ]);

  const revenueBy = new Map<string, { orders: number; revenue: number }>();
  for (const order of orders) {
    const bucket = revenueBy.get(order.restaurantId) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += netRevenue(order);
    revenueBy.set(order.restaurantId, bucket);
  }

  const expenseBy = new Map(
    expenses.map((row) => [row.restaurantId, row._sum?.amount ?? 0]),
  );

  const sites: SiteSummary[] = venues.map((venue) => {
    const counted = revenueBy.get(venue.id) ?? { orders: 0, revenue: 0 };
    const spent = expenseBy.get(venue.id) ?? 0;
    return {
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      isHeadOffice: venue.parentRestaurantId === null,
      managerName: venue.members[0]?.name ?? null,
      managerPhone: venue.members[0]?.phone ?? null,
      orders: counted.orders,
      revenue: counted.revenue,
      expenses: spent,
      net: counted.revenue - spent,
    };
  });

  return {
    sites,
    totals: {
      orders: sites.reduce((sum, s) => sum + s.orders, 0),
      revenue: sites.reduce((sum, s) => sum + s.revenue, 0),
      expenses: sites.reduce((sum, s) => sum + s.expenses, 0),
      net: sites.reduce((sum, s) => sum + s.net, 0),
    },
    days,
  };
}
