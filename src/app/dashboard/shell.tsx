"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ChefHat,
  ClipboardPen,
  CreditCard,
  ExternalLink,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Palette,
  QrCode,
  Receipt,
  Megaphone,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client-api";
import type { Locale } from "@/lib/i18n";
import { themeAttribute, type ThemePreference } from "@/lib/appearance";
import { canAccessTab, type StaffTab } from "@/lib/staff-tabs";
import { ThemeToggle } from "@/components/theme-toggle";

import { formatNumber } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /**
   * Who may see the link.
   *
   * `owner`    — the menu, the design, the money the chain pays us. A branch
   *              manager never sees these: a branch does not own its menu.
   * `operator` — what a single site runs for itself: its own numbers, its own
   *              tables, its own expenses. Owners and branch managers both.
   * `chain`    — the chain console, for an owner whose plan includes branches.
   * omitted    — everyone with a tenant, kitchen staff included.
   */
  access?: "owner" | "operator" | "chain";
  /**
   * A grantable section.
   *
   * When present it replaces `access` entirely, because `canAccessTab` already
   * answers for every role — owner, branch manager and staff — and two ways of
   * deciding the same thing is how a sidebar ends up offering a link the server
   * then refuses.
   */
  tab?: StaffTab;
}

export function DashboardShell({
  user,
  staffTabs = [],
  restaurant,
  isChainOwner = false,
  subscription,
  locale,
  dir,
  theme,
  labels,
  children,
}: {
  user: { name: string; phone: string | null; role: string };
  /** Sections granted to a STAFF account; empty for every other role. */
  staffTabs?: string[];
  restaurant: { name: string; slug: string; logoUrl: string | null };
  /** Heads a chain — shows the branch console. */
  isChainOwner?: boolean;
  subscription: {
    status: string;
    planName: string;
    daysLeft: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
  } | null;
  locale: Locale;
  dir: "rtl" | "ltr";
  theme: ThemePreference;
  labels: Record<string, string>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const isOwner = user.role === "OWNER";
  const isBranchManager = user.role === "BRANCH_MANAGER";

  const allNav: NavItem[] = [
    {
      href: "/dashboard",
      label: labels.overview,
      icon: LayoutDashboard,
      access: "operator",
    },
    { href: "/dashboard/orders", tab: "orders", label: labels.orders, icon: Receipt },
    {
      href: "/dashboard/orders/new",
      tab: "orders",
      label: labels.manualOrder,
      icon: ClipboardPen,
    },
    {
      href: "/dashboard/branches",
      label: labels.branches,
      icon: Building2,
      access: "chain",
    },
    {
      href: "/dashboard/menu",
      tab: "menu",
      label: labels.menu,
      icon: UtensilsCrossed,
      access: "owner",
    },
    {
      href: "/dashboard/design",
      tab: "design",
      label: labels.design,
      icon: Palette,
      access: "owner",
    },
    {
      href: "/dashboard/qr",
      tab: "qr",
      label: labels.qr,
      icon: QrCode,
      access: "operator",
    },
    {
      href: "/dashboard/analytics",
      tab: "analytics",
      label: labels.analytics,
      icon: TrendingUp,
      access: "operator",
    },
    {
      href: "/dashboard/finance",
      tab: "finance",
      label: labels.finance,
      icon: Wallet,
      access: "operator",
    },
    {
      // Owner-only and deliberately not a grantable tab: this reads guests'
      // phone numbers, and a section absent from STAFF_TABS stays closed.
      href: "/dashboard/customers",
      label: labels.customers,
      icon: Users,
      access: "owner",
    },
    {
      // Owner-only for the same reason as customers: a campaign is a statement
      // about who a venue's guests are, built from the same data.
      href: "/dashboard/campaigns",
      label: labels.campaigns,
      icon: Megaphone,
      access: "owner",
    },
    {
      href: "/dashboard/subscription",
      label: labels.subscription,
      icon: CreditCard,
      access: "owner",
    },
    {
      href: "/dashboard/settings",
      label: labels.settings,
      icon: Settings,
      access: "owner",
    },
    {
      href: "/dashboard/options",
      label: labels.moreOptions,
      icon: SlidersHorizontal,
      access: "owner",
    },
  ];

  const nav = allNav.filter((item) => {
    if (item.access === "chain") return isChainOwner;
    /*
      A grantable section answers through `canAccessTab`, the same function the
      server guard calls. Checked before `access` so the two cannot disagree:
      the sidebar must not offer a staff member a link that `requirePageTab`
      then redirects them away from.
    */
    if (item.tab) return canAccessTab({ role: user.role, staffTabs }, item.tab);
    if (item.access === "owner") return isOwner;
    if (item.access === "operator") return isOwner || isBranchManager;
    return true;
  });

  /** The single nav entry the current path belongs to: the longest that matches. */
  const activeHref = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Close the drawer on navigation — otherwise it stays over the new page.
  // Adjusted during render, so the new page never paints under an open drawer.
  const [drawerPath, setDrawerPath] = React.useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setMobileOpen(false);
  }

  async function handleLogout() {
    await api.post("/api/auth/logout");
    router.replace("/");
    router.refresh();
  }

  async function toggleLocale() {
    await api.post("/api/locale", { locale: locale === "fa" ? "en" : "fa" });
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
          <ChefHat className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-white">
            {restaurant.name}
          </span>
          <span className="block truncate text-[11px] text-sidebar-muted" dir="ltr">
            /menu/{restaurant.slug}
          </span>
        </span>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {nav.map(({ href, label, icon: Icon }) => {
          /*
            The longest matching link wins, rather than every prefix of the path.

            `/dashboard` is a prefix of everything and `/dashboard/orders` is a
            prefix of `/dashboard/orders/new`, so a plain `startsWith` lit up two
            or three items at once and the sidebar stopped saying where you were.
          */
          const active = href === activeHref;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-bold transition-colors",
                active
                  ? "bg-brand-500 text-ink-950"
                  : "text-sidebar-fg hover:bg-white/10",
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/10 p-3">
        <a
          href={`/menu/${restaurant.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-bold text-sidebar-fg transition-colors hover:bg-white/10"
        >
          <ExternalLink className="size-4.5 shrink-0" />
          {labels.viewMenu}
        </a>

        <button
          type="button"
          onClick={toggleLocale}
          className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-bold text-sidebar-fg transition-colors hover:bg-white/10"
        >
          <Languages className="size-4.5 shrink-0" />
          {locale === "fa" ? "English" : "فارسی"}
        </button>

        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2">
          <span className="text-sm font-bold text-sidebar-fg">{labels.appearance}</span>
          <ThemeToggle value={theme} tone="onDark" />
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-bold text-sidebar-fg transition-colors hover:bg-red-500/15 hover:text-red-300"
        >
          <LogOut className="size-4.5 shrink-0" />
          {labels.logout}
        </button>

        <div className="mt-2 flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-white/5 px-3 py-2.5">
          {/* `text-brand-300` inverts with the theme and resolved to a dark
              brown on this never-inverting panel — 2.4:1. Same trap as the nav
              labels, same fix. */}
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500/25 text-xs font-black text-sidebar-fg">
            {user.name.trim().charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-white">
              {user.name}
            </span>
            <span className="block truncate text-[11px] text-sidebar-muted" dir="ltr">
              {user.phone}
            </span>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    // The theme is scoped here rather than on <html>: everything inside the
    // panel follows the operator's preference, and nothing outside it does.
    <div data-theme={themeAttribute(theme)} className="min-h-dvh bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 bg-sidebar lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="بستن منو"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 start-0 w-72 animate-[fade-in_0.2s_ease-out] bg-sidebar">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:ms-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200 bg-surface/85 px-4 py-3 backdrop-blur-lg lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="باز کردن منو"
            className="grid size-10 place-items-center rounded-[var(--radius-sm)] text-ink-700 hover:bg-ink-100"
          >
            {mobileOpen ? <X className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
          <span className="truncate text-sm font-black text-ink-900">
            {restaurant.name}
          </span>
        </header>

        {subscription && (subscription.isExpired || subscription.isExpiringSoon) && (
          <div
            role="status"
            className={cn(
              "flex flex-wrap items-center gap-3 px-5 py-3 text-sm font-semibold",
              subscription.isExpired
                ? "bg-red-50 text-red-800"
                : "bg-amber-50 text-amber-900",
            )}
          >
            <AlertTriangle className="size-4.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {subscription.isExpired
                ? labels.expiredWarning
                : `${labels.expiringWarning} (${formatNumber(subscription.daysLeft, locale)} ${labels.daysLeft})`}
            </span>
            <Link
              href="/dashboard/subscription"
              className="shrink-0 rounded-full bg-ink-900 px-4 py-1.5 text-xs font-bold text-ink-50 hover:bg-ink-800"
            >
              {labels.renew}
            </Link>
          </div>
        )}

        <main id="main" dir={dir} className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
