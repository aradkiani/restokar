import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";
import { canAccessTab, landingPathFor, type StaffTab } from "../staff-tabs";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** For pages: bounce to login, preserving where the user was headed. */
export async function requirePageUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return user;
}

/** For route handlers: throw, so the API wrapper renders a 401 JSON body. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return user;
}

export interface TenantContext {
  user: SessionUser;
  restaurantId: string;
}

/**
 * The single place a tenant id may enter a query. It is derived from the
 * session — never from a request body, query string or route param — so a
 * caller cannot address another tenant's rows by guessing an id.
 *
 * SUPER_ADMIN has no tenant of its own and is deliberately rejected here;
 * platform-wide reads go through requireAdmin() and explicit queries.
 */
export async function requireTenant(): Promise<TenantContext> {
  const user = await requireApiUser();
  if (!user.restaurantId) {
    throw new HttpError(
      403,
      "No restaurant is associated with this account",
      "NO_TENANT",
    );
  }
  return { user, restaurantId: user.restaurantId };
}

/** Owner-only areas: menu editing, design, pricing options, settings, subscription. */
export async function requireOwner(): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (ctx.user.role !== "OWNER") {
    throw new HttpError(403, "Owner access required", "FORBIDDEN");
  }
  return ctx;
}

/**
 * Areas a site runs for itself: its orders, its tables and QR codes, its
 * expenses and its own numbers.
 *
 * Open to an OWNER and to a BRANCH_MANAGER, and to nothing else. The split from
 * `requireOwner` is deliberate rather than a widening of it: a branch manager
 * must be able to record what their site took and spent, and must not be able
 * to touch the menu, the design or the subscription — all of which belong to
 * the chain. Leaving those on `requireOwner` means a route added later is
 * closed to branches by default, which is the safe direction to fail.
 */
export async function requireBranchOperator(): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (ctx.user.role !== "OWNER" && ctx.user.role !== "BRANCH_MANAGER") {
    throw new HttpError(403, "Owner access required", "FORBIDDEN");
  }
  return ctx;
}

/**
 * The chain console: only an OWNER, and only one whose venue actually heads a
 * chain. A branch manager is rejected here even though they belong to a chain —
 * they run one site, they do not oversee the others.
 */
export async function requireChainOwner(): Promise<TenantContext> {
  const ctx = await requireOwner();
  const { prisma } = await import("../prisma");
  const venue = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
    select: { parentRestaurantId: true, subscription: { select: { plan: true } } },
  });

  // A branch never heads a chain, whatever role its user carries.
  if (venue?.parentRestaurantId) {
    throw new HttpError(403, "Branch access cannot manage a chain", "FORBIDDEN");
  }
  if (!venue?.subscription?.plan.allowsBranches) {
    throw new HttpError(403, "Plan does not include branches", "PLAN_NO_BRANCHES");
  }
  return ctx;
}

/**
 * A dashboard section, for whoever is allowed to open it.
 *
 * One guard covering owners, branch managers and staff, because `canAccessTab`
 * is one function and three guards asking it the same question in three ways is
 * how they drift. For an OWNER and a BRANCH_MANAGER this permits exactly what
 * `requireOwner` and `requireBranchOperator` already did — introducing staff
 * grants widens nothing for anyone who existed before.
 *
 * Sections that are *not* grantable — settings, subscription, the pricing
 * options, discount codes, staff itself — deliberately keep `requireOwner`.
 * A section added later is closed to staff until someone lists it in
 * STAFF_TABS, which is the safe direction to fail.
 */
export async function requireTab(tab: StaffTab): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!canAccessTab(ctx.user, tab)) {
    throw new HttpError(403, "You do not have access to this section", "FORBIDDEN");
  }
  return ctx;
}

/** Page form of {@link requireTab}. */
export async function requirePageTab(
  tab: StaffTab,
  returnTo: string,
): Promise<TenantContext> {
  const ctx = await requirePageTenant(returnTo);
  if (!canAccessTab(ctx.user, tab)) redirect(landingPathFor(ctx.user));
  return ctx;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (user.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "Platform admin access required", "FORBIDDEN");
  }
  return user;
}

export async function requirePageTenant(returnTo: string): Promise<TenantContext> {
  const user = await requirePageUser(returnTo);
  if (!user.restaurantId) redirect("/register/restaurant");
  return { user, restaurantId: user.restaurantId };
}

/*
  Both of these used to redirect a refusal to `/dashboard/orders` outright.
  That was safe while every STAFF account could open the board by role; it
  stopped being safe when the board moved behind an explicit grant, because a
  second staff member can never hold `orders` — it is exclusive — and the
  overview and the board then redirected to each other without end.

  `landingPathFor` answers with a page the account can actually open, and falls
  back to one that redirects nowhere. Owners and branch managers still land on
  the board, exactly as before.
*/
export async function requirePageOwner(returnTo: string): Promise<TenantContext> {
  const ctx = await requirePageTenant(returnTo);
  if (ctx.user.role !== "OWNER") redirect(landingPathFor(ctx.user));
  return ctx;
}

/** Page form of {@link requireBranchOperator}. */
export async function requirePageBranchOperator(
  returnTo: string,
): Promise<TenantContext> {
  const ctx = await requirePageTenant(returnTo);
  if (ctx.user.role !== "OWNER" && ctx.user.role !== "BRANCH_MANAGER") {
    redirect(landingPathFor(ctx.user));
  }
  return ctx;
}

/**
 * Page form of {@link requireChainOwner}.
 *
 * Redirects rather than throwing. The API guard's `HttpError` is caught by the
 * route wrapper and rendered as JSON; on a page nothing catches it, so the
 * throwing form turned "you are not a chain owner" into a 500 error screen.
 */
export async function requirePageChainOwner(returnTo: string): Promise<TenantContext> {
  const ctx = await requirePageTenant(returnTo);
  if (ctx.user.role !== "OWNER") redirect("/dashboard/orders");

  const { prisma } = await import("../prisma");
  const venue = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
    select: { parentRestaurantId: true, subscription: { select: { plan: true } } },
  });

  if (venue?.parentRestaurantId || !venue?.subscription?.plan.allowsBranches) {
    redirect("/dashboard");
  }
  return ctx;
}

export async function requirePageAdmin(): Promise<SessionUser> {
  const user = await requirePageUser("/admin");
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return user;
}
