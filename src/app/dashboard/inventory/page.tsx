import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BookOpen, Boxes, PackageOpen, Wallet } from "lucide-react";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import {
  MOVEMENT_PAGE_SIZE,
  listMovements,
  listPurchases,
  listSuppliers,
  purchaseSummary,
  resolveStockScope,
  stockList,
  stockValue,
} from "@/lib/inventory-server";
import { formatMoney, formatNumber } from "@/lib/format";
import { startOfDayInZone } from "@/lib/time";
import { StatTile } from "@/components/charts";
import { ExportButton } from "@/components/export-button";
import { cn } from "@/lib/utils";
import { StockView } from "./stock-view";
import { PurchaseForm, PurchaseList } from "./purchase-form";
import { WasteForm, WasteList } from "./waste-form";
import { CountForm } from "./count-form";
import { Suppliers } from "./suppliers";
import { History } from "./history";
import type { StockItemOption } from "./shared";

export const metadata: Metadata = { title: "انبار" };
export const dynamic = "force-dynamic";

const VIEWS = ["stock", "purchases", "waste", "count", "suppliers", "history"] as const;
type View = (typeof VIEWS)[number];

/**
 * The «انبار» section: one site's shelves and everything that moves them.
 *
 * Open to whoever holds the inventory section — the owner, a branch manager
 * for their own branch, or staff granted it. Only a chain owner may switch
 * sites; for everyone else the site is the one their session belongs to.
 * The catalogue itself (items, units, recipes) stays in More Options, with
 * the owner, because it decides what every dish costs.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; site?: string }>;
}) {
  const ctx = await requirePageTab("inventory", "/dashboard/inventory");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const view: View = VIEWS.includes(params.view as View)
    ? (params.view as View)
    : "stock";
  const scope = await resolveStockScope(ctx, params.site);
  const copy = t.stock;
  const isOwner = ctx.user.role === "OWNER";

  const [rows, money] = await Promise.all([
    stockList(scope),
    purchaseSummary(scope.siteId, startOfDayInZone(new Date(), -29), new Date()),
  ]);
  const items = rows.map((row) => ({
    id: row.itemId,
    name: row.name,
    unit: row.unit,
    isActive: row.isActive,
    quantityMilli: row.quantityMilli,
    unitCost: row.unitCost,
  }));
  const active = rows.filter((row) => row.isActive);
  const lowCount = active.filter((row) => row.isLow && !row.isNegative).length;
  const negativeCount = active.filter((row) => row.isNegative).length;

  const href = (next: { view?: View; site?: string }) => {
    const query = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== "stock") query.set("view", v);
    const site = next.site ?? scope.siteId;
    if (scope.sites.length > 1 && site !== scope.sites[0]!.id) query.set("site", site);
    const text = query.toString();
    return `/dashboard/inventory${text ? `?${text}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <Link
              href="/dashboard/options/inventory"
              className="tap-safe inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink-100 px-3.5 text-xs font-bold text-ink-700 transition-colors hover:text-ink-900"
            >
              <BookOpen className="size-4" aria-hidden />
              {copy.manageCatalogue}
            </Link>
          )}
          <ExportButton dataset="inventory" days={30} variant="ghost" />
        </div>
      </header>

      {scope.sites.length > 1 && (
        <nav aria-label={copy.site} className="flex flex-wrap gap-1.5">
          {scope.sites.map((site) => (
            <Link
              key={site.id}
              href={href({ site: site.id })}
              aria-current={site.id === scope.siteId ? "true" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold transition-colors",
                site.id === scope.siteId
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-surface text-ink-600 hover:border-ink-300",
              )}
            >
              {site.name}
            </Link>
          ))}
        </nav>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={copy.stockValue}
          value={`${formatMoney(stockValue(rows), locale)} ${t.common.toman}`}
          tone="brand"
          icon={<Boxes className="size-4" />}
        />
        <StatTile
          label={copy.lowItems}
          value={formatNumber(lowCount, locale)}
          tone={lowCount > 0 ? "negative" : "neutral"}
          icon={<PackageOpen className="size-4" />}
        />
        <StatTile
          label={copy.negativeItems}
          value={formatNumber(negativeCount, locale)}
          tone={negativeCount > 0 ? "negative" : "neutral"}
          icon={<AlertTriangle className="size-4" />}
          hint={negativeCount > 0 ? copy.negativeHint : undefined}
        />
        <StatTile
          label={copy.unpaid}
          value={`${formatMoney(money.unpaid, locale)} ${t.common.toman}`}
          tone={money.unpaid > 0 ? "negative" : "neutral"}
          icon={<Wallet className="size-4" />}
        />
      </section>

      <nav
        aria-label={copy.title}
        className="-mx-4 no-scrollbar flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {VIEWS.map((key) => (
          <Link
            key={key}
            href={href({ view: key })}
            aria-current={view === key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors",
              view === key
                ? "bg-ink-900 text-ink-50"
                : "bg-ink-100 text-ink-600 hover:text-ink-900",
            )}
          >
            {copy.views[key]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 && view !== "suppliers" ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-ink-300 p-8 text-center">
          <p className="text-sm text-ink-600">{copy.emptyCatalogue}</p>
          {isOwner && (
            <Link
              href="/dashboard/options/inventory"
              className="mt-3 inline-block text-sm font-bold text-brand-700 underline"
            >
              {copy.manageCatalogue}
            </Link>
          )}
        </div>
      ) : (
        <ViewBody
          view={view}
          scopeSite={scope.siteId}
          ownerId={scope.ownerId}
          isOwner={isOwner}
          rows={rows}
          items={items}
        />
      )}
    </div>
  );
}

/** The body of one tab, loading only what that tab shows. */
async function ViewBody({
  view,
  scopeSite,
  ownerId,
  isOwner,
  rows,
  items,
}: {
  view: View;
  scopeSite: string;
  ownerId: string;
  isOwner: boolean;
  rows: Awaited<ReturnType<typeof stockList>>;
  items: StockItemOption[];
}) {
  const scope = { siteId: scopeSite, ownerId, sites: [] };

  switch (view) {
    case "stock":
      return <StockView rows={rows} />;
    case "purchases": {
      const [suppliers, purchases] = await Promise.all([
        listSuppliers(ownerId),
        listPurchases(scopeSite),
      ]);
      return (
        <div className="space-y-5">
          <PurchaseForm siteId={scopeSite} items={items} suppliers={suppliers} />
          <PurchaseList siteId={scopeSite} rows={purchases} />
        </div>
      );
    }
    case "waste": {
      const waste = await listMovements(scope, { reason: "WASTE" });
      return (
        <div className="space-y-5">
          <WasteForm siteId={scopeSite} items={items} />
          <WasteList rows={waste} />
        </div>
      );
    }
    case "count":
      return <CountForm siteId={scopeSite} items={items} />;
    case "suppliers":
      return <Suppliers rows={await listSuppliers(ownerId)} canEdit={isOwner} />;
    case "history":
      return (
        <History
          siteId={scopeSite}
          items={items.map(({ id, name }) => ({ id, name }))}
          initialRows={await listMovements(scope, {})}
          pageSize={MOVEMENT_PAGE_SIZE}
        />
      );
  }
}
