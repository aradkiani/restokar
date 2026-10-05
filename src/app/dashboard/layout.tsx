import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getSubscriptionState } from "@/lib/plans";
import { getThemePreference } from "@/lib/appearance-server";
import { allowsBranches } from "@/lib/plan-terms";
import { DashboardShell } from "./shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  // Platform staff have their own console; a SUPER_ADMIN has no tenant here.
  if (user.role === "SUPER_ADMIN") redirect("/admin");
  if (!user.restaurantId) redirect("/login");

  const [restaurant, subscription, { t, locale, dir }, theme] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        parentRestaurantId: true,
        subscription: {
          select: { limitsSnapshot: true, plan: { select: { allowsBranches: true } } },
        },
      },
    }),
    getSubscriptionState(user.restaurantId),
    getI18n(),
    getThemePreference(),
  ]);

  if (!restaurant) redirect("/login");

  return (
    <DashboardShell
      user={{ name: user.name, phone: user.phone, role: user.role }}
      staffTabs={user.staffTabs}
      restaurant={{
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
      }}
      /* Heads a chain: an owner, on a branch-capable plan, that is not itself
         a branch. Only then does the chain console appear in the sidebar. */
      isChainOwner={
        user.role === "OWNER" &&
        !restaurant.parentRestaurantId &&
        Boolean(
          restaurant.subscription &&
          allowsBranches(
            restaurant.subscription.limitsSnapshot,
            restaurant.subscription.plan.allowsBranches,
          ),
        )
      }
      subscription={
        subscription
          ? {
              status: subscription.status,
              planName: subscription.planName,
              daysLeft: subscription.daysLeft,
              isExpired: subscription.isExpired,
              isExpiringSoon: subscription.isExpiringSoon,
            }
          : null
      }
      locale={locale}
      dir={dir}
      theme={theme}
      labels={{
        overview: t.dashboard.overview,
        inventory: t.dashboard.inventory,
        account: t.account.title,
        menu: t.dashboard.menu,
        design: t.dashboard.design,
        orders: t.dashboard.orders,
        manualOrder: t.manualOrder.navLabel,
        analytics: t.dashboard.analytics,
        finance: t.dashboard.finance,
        customers: t.customers.navLabel,
        campaigns: t.campaigns.navLabel,
        qr: t.dashboard.qr,
        branches: t.branches.navLabel,
        settings: t.dashboard.settings,
        moreOptions: t.dashboard.moreOptions,
        subscription: t.dashboard.subscription,
        viewMenu: t.dashboard.viewMenu,
        logout: t.nav.logout,
        expiredWarning: t.subscription.expiredWarning,
        expiringWarning: t.subscription.expiringWarning,
        daysLeft: t.subscription.daysLeft,
        renew: t.subscription.renew,
        language: t.common.language,
        appearance: t.common.appearance,
      }}
    >
      {children}
    </DashboardShell>
  );
}
