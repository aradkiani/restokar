import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Check,
  ClipboardList,
  Palette,
  Plus,
  QrCode,
  Receipt,
  ShoppingBag,
  PackageOpen,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requirePageBranchOperator } from "@/lib/auth/guards";
import { canAccessTab, type StaffTab } from "@/lib/staff-tabs";
import { formatQuantity, isLowStock } from "@/lib/inventory";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getRangeSummary, getTodayStats, getTopProducts } from "@/lib/analytics";
import {
  getMenuHealth,
  getPeakHours,
  getPendingStaffCalls,
  getTodayComparison,
} from "@/lib/dashboard-insights";
import {
  formatDateShort,
  formatMoney,
  formatNumber,
  formatTime,
  localizeDigits,
} from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { RankedBars, StatTile, TrendChart } from "@/components/charts";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { firstSteps, showFirstSteps } from "@/lib/first-steps";
import { DEFAULT_TEMPLATE_ID } from "@/templates/registry";

export const metadata: Metadata = { title: "پیشخوان" };
export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const { restaurantId, user } = await requirePageBranchOperator("/dashboard");
  const { t, locale } = await getI18n();

  /*
    A branch manager lands here too, but a branch owns no menu and no shelves —
    both belong to the chain owner. Counting products, scoring menu health or
    reading stock by the branch's own id always produced zeros, and shortcuts
    to sections the manager cannot open bounced them to the order board. Each
    menu- or stock-shaped part of the page now appears only to someone who can
    act on it.
  */
  const canMenu = canAccessTab(user, "menu");
  const ownsStock = user.role === "OWNER";

  const [
    today,
    summary,
    topProducts,
    recentOrders,
    counts,
    comparison,
    health,
    staffCalls,
    peakHours,
  ] = await Promise.all([
    getTodayStats(restaurantId),
    getRangeSummary(restaurantId, 14),
    getTopProducts(restaurantId, 30, 5),
    prisma.order.findMany({
      where: { restaurantId },
      orderBy: { placedAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        tableNumber: true,
        total: true,
        status: true,
        placedAt: true,
      },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        slug: true,
        parentRestaurantId: true,
        logoUrl: true,
        tagline: true,
        phone: true,
        address: true,
        templateId: true,
        theme: true,
        _count: {
          select: { products: true, categories: true, tables: true, orders: true },
        },
      },
    }),
    getTodayComparison(restaurantId),
    canMenu ? getMenuHealth(restaurantId) : Promise.resolve(null),
    getPendingStaffCalls(restaurantId),
    getPeakHours(restaurantId),
  ]);

  /*
    Filtered in JS rather than in the query.

    The rule compares two columns — stock at or below its own threshold — and
    the readable way to express that is `isLowStock`, the same function the
    inventory tab uses to decide what to badge. Narrowing to watched items first
    keeps the set small, and a venue's ingredient list is tens of rows, not
    thousands.
  */
  const watched = ownsStock
    ? await prisma.inventoryItem.findMany({
        where: { restaurantId, lowStockMilli: { gt: 0 }, isActive: true },
        orderBy: { name: "asc" },
        take: 200,
        select: {
          id: true,
          name: true,
          unit: true,
          quantityMilli: true,
          lowStockMilli: true,
        },
      })
    : [];
  const lowStock = watched.filter(isLowStock);

  // Only the owner of a venue with its own menu sets these things up; a
  // branch serves its chain's menu and design.
  const setup =
    user.role === "OWNER" && counts && !counts.parentRestaurantId
      ? firstSteps(
          {
            ...counts,
            products: counts._count.products,
            tables: counts._count.tables,
            orders: counts._count.orders,
          },
          DEFAULT_TEMPLATE_ID,
        )
      : null;
  const showSetup = setup !== null && showFirstSteps(setup, counts?._count.orders ?? 0);

  const quickActions = (
    [
      {
        href: "/dashboard/menu",
        label: t.menuBuilder.addProduct,
        icon: Plus,
        tab: "menu",
      },
      {
        href: "/dashboard/design",
        label: t.dashboard.design,
        icon: Palette,
        tab: "design",
      },
      { href: "/dashboard/qr", label: t.dashboard.qr, icon: QrCode, tab: "qr" },
      {
        href: "/dashboard/analytics",
        label: t.dashboard.analytics,
        icon: TrendingUp,
        tab: "analytics",
      },
    ] satisfies { href: string; label: string; icon: typeof Plus; tab: StaffTab }[]
  ).filter((action) => canAccessTab(user, action.tab));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">
            {t.dashboard.welcome}، {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {canMenu && (
              <>
                {formatNumber(counts?._count.products ?? 0, locale)}{" "}
                {t.dashboard.products} ·{" "}
                {formatNumber(counts?._count.categories ?? 0, locale)}{" "}
                {t.dashboard.categories} ·{" "}
              </>
            )}
            {formatNumber(counts?._count.tables ?? 0, locale)} {t.dashboard.tables}
          </p>
        </div>
        <Link
          href={`/menu/${counts?.slug ?? ""}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-surface px-4 py-2 text-sm font-bold text-ink-800 transition-colors hover:border-ink-400"
        >
          {t.dashboard.viewMenu}
          <ArrowUpRight className="size-4" />
        </Link>
      </header>

      {showSetup && setup && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t.dashboard.firstStepsTitle}</CardTitle>
              <p className="mt-1 text-xs text-ink-500">
                {t.dashboard.firstStepsSubtitle}
              </p>
            </div>
            <span className="text-xs font-bold text-ink-600">
              {t.dashboard.firstStepsProgress
                .replace(
                  "{done}",
                  formatNumber(setup.filter((s) => s.done).length, locale),
                )
                .replace("{total}", formatNumber(setup.length, locale))}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <ol className="divide-y divide-ink-100">
              {setup.map((step, index) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    target={step.key === "order" ? "_blank" : undefined}
                    className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm hover:bg-ink-50"
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-black",
                        step.done
                          ? "bg-emerald-600 text-white"
                          : "bg-ink-100 text-ink-600",
                      )}
                    >
                      {step.done ? (
                        <Check className="size-4" />
                      ) : (
                        formatNumber(index + 1, locale)
                      )}
                    </span>
                    <span
                      className={cn(
                        "flex-1 font-bold",
                        step.done ? "text-ink-400 line-through" : "text-ink-800",
                      )}
                    >
                      {t.dashboard.firstSteps[step.key]}
                    </span>
                    {!step.done && <ArrowUpRight className="size-4 text-ink-400" />}
                  </Link>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {/*
        Ingredients that have reached their warning level.

        Below the staff calls — someone waiting at a table is more urgent than a
        shelf that will run out later today — but above the figures, because it
        is the one thing on this page that needs an action rather than a read.
        It is deliberately quiet when nothing is low: an alert that is always
        present stops being an alert.
      */}
      {lowStock.length > 0 && (
        <section
          role="alert"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-orange-300 bg-orange-50 p-3.5"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-orange-900">
            <PackageOpen className="size-4 shrink-0" />
            {t.inventory.dashboardTitle}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {lowStock.map((item) => (
              <span
                key={item.id}
                className="rounded-full bg-orange-200/70 px-2.5 py-1 text-xs font-bold text-orange-900"
              >
                {item.name}
                <span className="mx-1 opacity-60">·</span>
                <bdi>
                  {localizeDigits(formatQuantity(item.quantityMilli), locale)}{" "}
                  {t.costing.units[item.unit as keyof typeof t.costing.units] ??
                    item.unit}
                </bdi>
              </span>
            ))}
          </span>
          <Link
            href="/dashboard/options/inventory"
            className="ms-auto text-xs font-bold text-orange-900 underline"
          >
            {t.inventory.manageLink}
          </Link>
        </section>
      )}

      {/* A guest with their hand up outranks every figure on this page, so it
          sits above them rather than in a card further down. */}
      {staffCalls.length > 0 && (
        <section
          role="alert"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 p-3.5"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <BellRing className="size-4 shrink-0" />
            {t.dashboard.pendingStaffCalls}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {staffCalls.map((call) => (
              <span
                key={call.id}
                className="rounded-full bg-amber-200/70 px-2.5 py-1 text-xs font-bold text-amber-900"
              >
                {t.kitchen.table} <bdi>{localizeDigits(call.tableNumber, locale)}</bdi>
                {call.kind === "BILL" && ` — ${t.kitchen.billRequest}`}
                <span className="mx-1 opacity-60">·</span>
                <bdi>{formatTime(call.createdAt, locale)}</bdi>
              </span>
            ))}
          </span>
          <Link
            href="/dashboard/orders"
            className="ms-auto text-xs font-bold text-amber-900 underline"
          >
            {t.dashboard.orders}
          </Link>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t.dashboard.todayRevenue}
          value={`${formatMoney(today.revenue, locale)} ${t.common.toman}`}
          tone="brand"
          icon={<Wallet className="size-4" />}
          hint={
            <DeltaHint comparison={comparison.revenue} label={t.dashboard.vsLastWeek} />
          }
        />
        <StatTile
          label={t.dashboard.todayOrders}
          value={formatNumber(today.orders, locale)}
          icon={<ShoppingBag className="size-4" />}
          hint={
            <DeltaHint comparison={comparison.orders} label={t.dashboard.vsLastWeek} />
          }
        />
        <StatTile
          label={t.dashboard.pendingOrders}
          value={formatNumber(today.openOrders, locale)}
          tone={today.openOrders > 0 ? "negative" : "neutral"}
          icon={<ClipboardList className="size-4" />}
        />
        <StatTile
          label={t.dashboard.avgOrder}
          value={`${formatMoney(today.averageOrderValue, locale)} ${t.common.toman}`}
          icon={<Receipt className="size-4" />}
        />
      </section>

      <section>
        <p className="mb-2.5 text-sm font-bold text-ink-700">
          {t.dashboard.quickActions}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-2.5 rounded-[var(--radius-md)] border border-ink-200 bg-surface p-3.5 text-sm font-bold text-ink-800 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-brand-300"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
                <Icon className="size-4.5" />
              </span>
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.analytics.salesTrend}</CardTitle>
            <span className="text-xs font-semibold text-ink-500">
              {t.analytics.range7}+
            </span>
          </CardHeader>
          <CardBody>
            <TrendChart
              locale={locale}
              emptyLabel={t.analytics.noData}
              ariaLabel={t.analytics.salesTrendChart}
              points={summary.series.map((point) => ({
                label: formatDateShort(new Date(`${point.date}T00:00:00`), locale),
                value: point.revenue,
                secondary: point.orders,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.topProducts}</CardTitle>
          </CardHeader>
          <CardBody>
            <RankedBars
              locale={locale}
              emptyLabel={t.analytics.noData}
              maxRows={5}
              data={topProducts.map((product) => ({
                label: product.name,
                value: product.revenue,
                meta: `${formatNumber(product.quantity, locale)} ${t.analytics.units}`,
              }))}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------- when to roster */}
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.peakHours}</CardTitle>
            <span className="text-xs font-semibold text-ink-500">
              {t.dashboard.peakHoursRange}
            </span>
          </CardHeader>
          <CardBody>
            {peakHours.length === 0 ? (
              <p className="text-sm text-ink-500">{t.analytics.noData}</p>
            ) : (
              <ul className="space-y-2.5">
                {peakHours.map((slot) => (
                  <li key={slot.hour} className="flex items-center gap-3">
                    {/* A clock time is a label, not a quantity: localizeDigits
                        converts the digits while leaving the colon in place,
                        which formatNumber would strip. */}
                    <span className="w-24 shrink-0 text-sm font-bold tabular-nums">
                      <bdi>
                        {localizeDigits(
                          `${String(slot.hour).padStart(2, "0")}:00`,
                          locale,
                        )}
                      </bdi>
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <span
                        className="block h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.round(slot.share * 100)}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-end text-xs font-semibold text-ink-500 tabular-nums">
                      <bdi>{formatNumber(slot.orders, locale)}</bdi>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* --------------------------------------------- what needs fixing */}
        {health && (
          <Card>
            <CardHeader>
              <CardTitle>{t.dashboard.menuHealth}</CardTitle>
              <Link
                href="/dashboard/menu"
                className="text-xs font-bold text-brand-700 hover:underline"
              >
                {t.dashboard.menu}
              </Link>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                <HealthRow
                  label={t.dashboard.healthMissingCost}
                  count={health.missingCost}
                  total={health.total}
                  locale={locale}
                  /* The costliest gap: a product with no cost reports 100%
                   margin, so the finance page flatters exactly the items
                   nobody has costed. */
                  severe
                />
                {/* Omitted entirely for a venue that has turned photos off:
                  showing "۰ از ۹" would still frame photography as a measure
                  it is being scored against. */}
                {health.missingImage !== null && (
                  <HealthRow
                    label={t.dashboard.healthMissingImage}
                    count={health.missingImage}
                    total={health.total}
                    locale={locale}
                  />
                )}
                <HealthRow
                  label={t.dashboard.healthMissingDescription}
                  count={health.missingDescription}
                  total={health.total}
                  locale={locale}
                />
                <HealthRow
                  label={t.dashboard.healthUnavailable}
                  count={health.unavailable}
                  total={health.total}
                  locale={locale}
                />
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.recentOrders}</CardTitle>
          <Link
            href="/dashboard/orders"
            className="text-xs font-bold text-brand-700 hover:underline"
          >
            {t.dashboard.orders}
          </Link>
        </CardHeader>

        {recentOrders.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6" />}
            title={t.dashboard.noOrdersYet}
            description={t.qr.subtitle}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs text-ink-500">
                  <th className="p-3 text-start font-semibold">#</th>
                  <th className="p-3 text-start font-semibold">{t.dashboard.customer}</th>
                  <th className="p-3 text-start font-semibold">{t.kitchen.table}</th>
                  <th className="p-3 text-start font-semibold">{t.publicMenu.total}</th>
                  <th className="p-3 text-start font-semibold">
                    {t.subscription.status}
                  </th>
                  <th className="p-3 text-start font-semibold">
                    {t.orderStatus.placedAt}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-ink-50">
                    <td className="p-3 font-bold tabular-nums">
                      {formatNumber(order.orderNumber, locale)}
                    </td>
                    <td className="p-3">{order.customerName}</td>
                    <td className="p-3 tabular-nums">
                      {order.tableNumber
                        ? localizeDigits(order.tableNumber, locale)
                        : "—"}
                    </td>
                    <td className="p-3 font-semibold tabular-nums">
                      {formatMoney(order.total, locale)}
                    </td>
                    <td className="p-3">
                      <OrderStatusBadge status={order.status} locale={locale} />
                    </td>
                    <td className="p-3 text-ink-500 tabular-nums">
                      {formatTime(order.placedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * "۱۲٪ بیشتر از هفته گذشته".
 *
 * Direction is carried by an arrow and a word as well as by colour, so the
 * meaning survives for a colour-blind reader and in a printed page. The two
 * numbers are each wrapped in <bdi> — adjacent digit runs in RTL otherwise read
 * as one long number.
 */
function DeltaHint({
  comparison,
  label,
}: {
  comparison: { current: number; previous: number; deltaPercent: number | null };
  label: string;
}) {
  const { deltaPercent } = comparison;

  // No baseline: last week at this hour had nothing to compare against, and
  // "+∞%" is not a fact about the business.
  if (deltaPercent === null) return null;
  if (deltaPercent === 0) return <span>—</span>;

  const up = deltaPercent > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold",
        up ? "text-emerald-700" : "text-red-700",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      <bdi>{Math.abs(deltaPercent)}٪</bdi>
      <span className="font-normal text-ink-500">{label}</span>
    </span>
  );
}

/** One gap in the menu data, with the count that makes it worth acting on. */
function HealthRow({
  label,
  count,
  total,
  locale,
  severe = false,
}: {
  label: string;
  count: number;
  total: number;
  locale: Locale;
  severe?: boolean;
}) {
  const clean = count === 0;

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        {clean ? (
          <Check className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertCircle
            className={cn("size-4 shrink-0", severe ? "text-red-600" : "text-amber-600")}
          />
        )}
        <span className="truncate text-ink-700">{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-xs font-bold tabular-nums",
          clean ? "text-emerald-700" : severe ? "text-red-700" : "text-ink-700",
        )}
      >
        <bdi>{formatNumber(count, locale)}</bdi>
        <span className="mx-1 font-normal text-ink-400">/</span>
        <bdi>{formatNumber(total, locale)}</bdi>
      </span>
    </li>
  );
}
