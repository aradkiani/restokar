import "server-only";
import { prisma } from "./prisma";
import { EXPIRY_WARNING_DAYS } from "./constants";
import { COUNTED_ORDER } from "./order-status";

/**
 * Platform-wide queries for the admin console.
 *
 * Everything here reads across all tenants, which is exactly what makes it
 * dangerous: no function in this module may be reachable without
 * requireAdmin(). Callers are limited to /api/admin/* and /admin pages, both of
 * which assert SUPER_ADMIN before touching these.
 *
 * The counterpart to src/lib/analytics.ts, which is scoped to one restaurant
 * and safe for owners.
 */

/** Demo showcase venues are platform-owned and excluded from customer metrics. */
const REAL_TENANTS = { isDemo: false } as const;

export interface PlatformOverview {
  totalRestaurants: number;
  activeRestaurants: number;
  activeSubscriptions: number;
  expiringSoon: number;
  totalRevenue: number;
  monthlyRevenue: number;
}

/**
 * Platform revenue counts settled subscription payments only.
 *
 * Order payments belong to the restaurant, not to us, so they are excluded —
 * conflating the two would overstate platform revenue by orders of magnitude.
 * Gifted extensions carry no Payment row and therefore cannot inflate this.
 */
const SUBSCRIPTION_REVENUE = {
  purpose: "SUBSCRIPTION",
  status: "PAID",
} as const;

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const expiryCutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalRestaurants,
    activeRestaurants,
    activeSubscriptions,
    expiringSoon,
    allTime,
    thisMonth,
  ] = await Promise.all([
    prisma.restaurant.count({ where: REAL_TENANTS }),
    prisma.restaurant.count({ where: { ...REAL_TENANTS, isActive: true } }),
    prisma.subscription.count({
      where: { status: { in: ["ACTIVE", "TRIALING"] }, restaurant: REAL_TENANTS },
    }),
    prisma.subscription.count({
      where: {
        status: { in: ["ACTIVE", "TRIALING"] },
        currentPeriodEnd: { gte: now, lte: expiryCutoff },
        restaurant: REAL_TENANTS,
      },
    }),
    prisma.payment.aggregate({
      where: SUBSCRIPTION_REVENUE,
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { ...SUBSCRIPTION_REVENUE, verifiedAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalRestaurants,
    activeRestaurants,
    activeSubscriptions,
    expiringSoon,
    totalRevenue: allTime._sum.amount ?? 0,
    monthlyRevenue: thisMonth._sum.amount ?? 0,
  };
}

export interface PlatformRevenue {
  total: number;
  thisMonth: number;
  lastThreeMonths: number;
  thisYear: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  totalRestaurants: number;
  payingRestaurants: number;
  averageRevenuePerPayingRestaurant: number;
  series: { label: string; revenue: number }[];
}

export async function getPlatformRevenue(): Promise<PlatformRevenue> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [payments, activeSubscriptions, expiredSubscriptions, totalRestaurants] =
    await Promise.all([
      prisma.payment.findMany({
        where: { ...SUBSCRIPTION_REVENUE, verifiedAt: { gte: seriesStart } },
        select: { amount: true, verifiedAt: true, restaurantId: true },
      }),
      prisma.subscription.count({
        where: { status: { in: ["ACTIVE", "TRIALING"] }, restaurant: REAL_TENANTS },
      }),
      prisma.subscription.count({
        where: { status: { in: ["EXPIRED", "CANCELED"] }, restaurant: REAL_TENANTS },
      }),
      prisma.restaurant.count({ where: REAL_TENANTS }),
    ]);

  // Totals outside the 12-month series window still count toward all-time.
  const allTime = await prisma.payment.aggregate({
    where: SUBSCRIPTION_REVENUE,
    _sum: { amount: true },
  });

  const buckets = new Map<string, { label: string; revenue: number; sort: string }>();
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(date);
    buckets.set(key, {
      sort: key,
      label: new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short" }).format(
        date,
      ),
      revenue: 0,
    });
  }

  let thisMonth = 0;
  let lastThreeMonths = 0;
  let thisYear = 0;
  const payingRestaurants = new Set<string>();

  for (const payment of payments) {
    if (!payment.verifiedAt) continue;
    payingRestaurants.add(payment.restaurantId);

    const bucket = buckets.get(monthKey(payment.verifiedAt));
    if (bucket) bucket.revenue += payment.amount;

    if (payment.verifiedAt >= monthStart) thisMonth += payment.amount;
    if (payment.verifiedAt >= threeMonthsAgo) lastThreeMonths += payment.amount;
    if (payment.verifiedAt >= yearStart) thisYear += payment.amount;
  }

  const total = allTime._sum.amount ?? 0;

  return {
    total,
    thisMonth,
    lastThreeMonths,
    thisYear,
    activeSubscriptions,
    expiredSubscriptions,
    totalRestaurants,
    payingRestaurants: payingRestaurants.size,
    averageRevenuePerPayingRestaurant:
      payingRestaurants.size > 0 ? Math.round(total / payingRestaurants.size) : 0,
    series: [...buckets.values()]
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ sort: _sort, ...rest }) => rest),
  };
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export type RestaurantSortKey = "name" | "createdAt" | "expiresAt" | "revenue" | "status";

export interface AdminRestaurantRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isDemo: boolean;
  createdAt: Date;
  owner: { name: string; email: string };
  plan: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  /** Subscription revenue this restaurant has produced for the platform. */
  platformRevenue: number;
}

export interface AdminRestaurantQuery {
  search?: string;
  status?: string;
  plan?: string;
  sort?: RestaurantSortKey;
  direction?: "asc" | "desc";
  registeredAfter?: Date;
}

/**
 * Restaurant list for the admin table.
 *
 * Search and filtering run in the database; the revenue sort is applied in JS
 * because per-tenant revenue is an aggregate over another table. At platform
 * scale (hundreds of venues) that is fine — if this ever grows, revenue moves
 * to a materialised column rather than a heavier query here.
 */
export async function listRestaurantsForAdmin(
  query: AdminRestaurantQuery,
): Promise<AdminRestaurantRow[]> {
  const search = query.search?.trim();

  const restaurants = await prisma.restaurant.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { owner: { name: { contains: search, mode: "insensitive" } } },
              { owner: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(query.status ? { subscription: { status: query.status as never } } : {}),
      ...(query.plan ? { subscription: { plan: { code: query.plan } } } : {}),
      ...(query.registeredAfter ? { createdAt: { gte: query.registeredAfter } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      isDemo: true,
      createdAt: true,
      owner: { select: { name: true, email: true } },
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          plan: { select: { name: true, code: true } },
        },
      },
    },
  });

  const revenueByRestaurant = await prisma.payment.groupBy({
    by: ["restaurantId"],
    where: SUBSCRIPTION_REVENUE,
    _sum: { amount: true },
  });
  const revenueMap = new Map(
    revenueByRestaurant.map((row) => [row.restaurantId, row._sum.amount ?? 0]),
  );

  const rows: AdminRestaurantRow[] = restaurants.map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    isActive: restaurant.isActive,
    isDemo: restaurant.isDemo,
    createdAt: restaurant.createdAt,
    owner: restaurant.owner,
    plan: restaurant.subscription?.plan.name ?? null,
    subscriptionStatus: restaurant.subscription?.status ?? null,
    currentPeriodEnd: restaurant.subscription?.currentPeriodEnd ?? null,
    platformRevenue: revenueMap.get(restaurant.id) ?? 0,
  }));

  const direction = query.direction === "asc" ? 1 : -1;
  const sort = query.sort ?? "createdAt";

  rows.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name, "fa") * direction;
      case "expiresAt":
        return (
          ((a.currentPeriodEnd?.getTime() ?? 0) - (b.currentPeriodEnd?.getTime() ?? 0)) *
          direction
        );
      case "revenue":
        return (a.platformRevenue - b.platformRevenue) * direction;
      case "status":
        return (
          (a.subscriptionStatus ?? "").localeCompare(b.subscriptionStatus ?? "") *
          direction
        );
      default:
        return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
    }
  });

  return rows;
}

export async function getRestaurantForAdmin(restaurantId: string) {
  const [restaurant, revenue, orderStats] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        nameEn: true,
        slug: true,
        phone: true,
        address: true,
        templateId: true,
        isActive: true,
        isPublished: true,
        isDemo: true,
        createdAt: true,
        owner: { select: { id: true, name: true, email: true, createdAt: true } },
        _count: { select: { products: true, categories: true, orders: true } },
        subscription: {
          select: {
            id: true,
            status: true,
            interval: true,
            startedAt: true,
            currentPeriodEnd: true,
            canceledAt: true,
            plan: { select: { name: true, code: true, monthlyPrice: true } },
            extensions: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                extensionType: true,
                previousExpiration: true,
                newExpiration: true,
                durationDays: true,
                reason: true,
                adminEmail: true,
                createdAt: true,
              },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                amount: true,
                status: true,
                provider: true,
                refId: true,
                verifiedAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    }),
    prisma.payment.aggregate({
      where: { restaurantId, ...SUBSCRIPTION_REVENUE },
      _sum: { amount: true },
    }),
    prisma.order.aggregate({
      where: { restaurantId, ...COUNTED_ORDER },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  if (!restaurant) return null;

  return {
    ...restaurant,
    platformRevenue: revenue._sum.amount ?? 0,
    ownRevenue: orderStats._sum.total ?? 0,
    orderCount: orderStats._count,
  };
}

export interface ExpiringSubscription {
  restaurantId: string;
  restaurantName: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date;
  daysRemaining: number;
}

export async function getExpiringSubscriptions(
  withinDays = EXPIRY_WARNING_DAYS,
): Promise<ExpiringSubscription[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 86_400_000);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      currentPeriodEnd: { lte: cutoff },
      restaurant: REAL_TENANTS,
    },
    orderBy: { currentPeriodEnd: "asc" },
    select: {
      status: true,
      currentPeriodEnd: true,
      plan: { select: { name: true } },
      restaurant: { select: { id: true, name: true } },
    },
  });

  return subscriptions.map((subscription) => ({
    restaurantId: subscription.restaurant.id,
    restaurantName: subscription.restaurant.name,
    plan: subscription.plan.name,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    // Negative for already-expired subscriptions, which the UI shows in red.
    daysRemaining: Math.ceil(
      (subscription.currentPeriodEnd.getTime() - now.getTime()) / 86_400_000,
    ),
  }));
}
