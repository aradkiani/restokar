"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, LifeBuoy, Percent, SlidersHorizontal, Users } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * More Options is a section rather than a page.
 *
 * The tabs live beside the content on a desktop, which is where an owner does
 * this kind of work, and collapse to a scrolling strip on a phone — a column of
 * tabs above a form would push the form itself off the first screen.
 *
 * Each tab is a real route, not local state: an owner who is halfway through
 * writing a discount code and follows a link back can use the browser's own
 * back button, and a link to a specific tab can be sent to them.
 */
const TABS = [
  { href: "/dashboard/options", labelKey: "pricingTab", icon: SlidersHorizontal },
  { href: "/dashboard/options/discounts", labelKey: "discountsTab", icon: Percent },
  { href: "/dashboard/options/inventory", labelKey: "inventoryTab", icon: Boxes },
  { href: "/dashboard/options/staff", labelKey: "staffTab", icon: Users },
  // Support sits last deliberately: it is where an owner goes when the tabs
  // above have not answered the question.
  { href: "/dashboard/options/support", labelKey: "supportTab", icon: LifeBuoy },
] as const;

export default function OptionsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <nav
        aria-label={t.dashboard.moreOptions}
        className="-mx-1 no-scrollbar flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0"
      >
        {TABS.map((tab) => {
          /*
            The pricing tab is the section's index, so a plain `startsWith`
            would light it up on every child route as well. Only the nested
            tabs match by prefix, which is what keeps a future
            `/options/discounts/<id>` highlighting its own tab.
          */
          const isActive =
            tab.href === "/dashboard/options"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "tap-safe inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-bold whitespace-nowrap transition-colors",
                isActive
                  ? "bg-brand-600 text-white"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              <tab.icon className="size-4 shrink-0" />
              {t.options[tab.labelKey]}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
