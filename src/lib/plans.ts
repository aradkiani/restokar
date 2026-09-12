import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./auth/guards";
import { DAY_MS, RENEWAL_WARNING_DAYS } from "./constants";

/**
 * Plan enforcement.
 *
 * Limits are read from the Plan row rather than hard-coded so the platform
 * admin can retune packaging without a deploy. -1 always means unlimited.
 */

export interface PlanLimits {
  maxProducts: number;
  maxCategories: number;
  maxTables: number;
  allowsOnlinePay: boolean;
  allowsAnalytics: boolean;
}

const UNLIMITED: PlanLimits = {
  maxProducts: -1,
  maxCategories: -1,
  maxTables: -1,
  allowsOnlinePay: true,
  allowsAnalytics: true,
};

export async function getPlanLimits(restaurantId: string): Promise<PlanLimits> {
  const subscription = await prisma.subscription.findUnique({
    where: { restaurantId },
    include: { plan: true },
  });

  // A restaurant with no subscription row predates billing or was created by
  // an admin; treat it as unrestricted rather than locking the owner out.
  if (!subscription) return UNLIMITED;

  return {
    maxProducts: subscription.plan.maxProducts,
    maxCategories: subscription.plan.maxCategories,
    maxTables: subscription.plan.maxTables,
    allowsOnlinePay: subscription.plan.allowsOnlinePay,
    allowsAnalytics: subscription.plan.allowsAnalytics,
  };
}

function withinLimit(current: number, max: number): boolean {
  return max < 0 || current < max;
}

export async function assertCanAddProduct(restaurantId: string): Promise<void> {
  const limits = await getPlanLimits(restaurantId);
  if (limits.maxProducts < 0) return;

  const count = await prisma.product.count({ where: { restaurantId } });
  if (!withinLimit(count, limits.maxProducts)) {
    throw new HttpError(
      402,
      `پلن فعلی شما حداکثر ${limits.maxProducts} محصول را پشتیبانی می‌کند.`,
      "PLAN_LIMIT_PRODUCTS",
    );
  }
}

export async function assertCanAddCategory(restaurantId: string): Promise<void> {
  const limits = await getPlanLimits(restaurantId);
  if (limits.maxCategories < 0) return;

  const count = await prisma.category.count({ where: { restaurantId } });
  if (!withinLimit(count, limits.maxCategories)) {
    throw new HttpError(
      402,
      `پلن فعلی شما حداکثر ${limits.maxCategories} دسته‌بندی را پشتیبانی می‌کند.`,
      "PLAN_LIMIT_CATEGORIES",
    );
  }
}

export async function assertCanAddTable(restaurantId: string): Promise<void> {
  const limits = await getPlanLimits(restaurantId);
  if (limits.maxTables < 0) return;

  const count = await prisma.restaurantTable.count({ where: { restaurantId } });
  if (!withinLimit(count, limits.maxTables)) {
    throw new HttpError(
      402,
      `پلن فعلی شما حداکثر ${limits.maxTables} میز را پشتیبانی می‌کند.`,
      "PLAN_LIMIT_TABLES",
    );
  }
}

export interface SubscriptionState {
  status: string;
  planName: string;
  planCode: string;
  currentPeriodEnd: Date;
  daysLeft: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export async function getSubscriptionState(
  restaurantId: string,
): Promise<SubscriptionState | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { restaurantId },
    include: { plan: true },
  });
  if (!subscription) return null;

  const msLeft = subscription.currentPeriodEnd.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / DAY_MS);

  return {
    status: subscription.status,
    planName: subscription.plan.name,
    planCode: subscription.plan.code,
    currentPeriodEnd: subscription.currentPeriodEnd,
    daysLeft,
    isExpired: msLeft <= 0,
    isExpiringSoon: daysLeft > 0 && daysLeft <= RENEWAL_WARNING_DAYS,
  };
}
