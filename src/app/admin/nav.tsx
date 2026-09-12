"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Clock,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

/**
 * Admin navigation. A client component only because the active tab depends on
 * the current path; it renders no data and grants no access — authorization
 * lives in the server layout.
 */
export function AdminNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const links = [
    { href: "/admin", label: t.admin.overview, icon: LayoutDashboard, exact: true },
    { href: "/admin/restaurants", label: t.admin.restaurants, icon: Building2 },
    { href: "/admin/accounts/new", label: t.admin.newAccount, icon: UserPlus },
    { href: "/admin/revenue", label: t.admin.revenueTitle, icon: BarChart3 },
    { href: "/admin/expiring", label: t.admin.expiringSoon, icon: Clock },
    { href: "/admin/support", label: t.admin.support, icon: LifeBuoy },
    { href: "/admin/settings", label: t.admin.settings, icon: Settings },
  ];

  return (
    <nav className="mx-auto max-w-7xl px-5">
      <ul className="-mx-1 chip-rail gap-1 pb-px">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-sm font-bold transition-colors",
                  active
                    ? "border-brand-500 text-ink-900"
                    : "border-transparent text-ink-500 hover:text-ink-800",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
