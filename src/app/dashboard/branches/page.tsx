import type { Metadata } from "next";
import { requirePageChainOwner } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { getChainSummary } from "@/lib/chain";
import { env } from "@/lib/env";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AddBranchForm } from "./add-branch";

export const metadata: Metadata = { title: "شعبه‌ها" };

/**
 * The chain console.
 *
 * One row per site — the head office and every branch — with the numbers each
 * one earned. The revenue is not entered here by the chain: it is whatever the
 * branch's own orders and expenses added up to, recorded at the branch by the
 * people working there. This screen only aggregates.
 */
export default async function BranchesPage() {
  const { restaurantId } = await requirePageChainOwner("/dashboard/branches");
  const [{ t, locale }, summary] = await Promise.all([
    getI18n(),
    getChainSummary(restaurantId),
  ]);

  const money = (value: number) => formatMoney(value, locale);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-black text-ink-900">{t.branches.title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-ink-600">
          {t.branches.subtitle}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {t.branches.title}
            <span className="ms-2 font-normal text-ink-500">
              ({t.branches.rangeMonth})
            </span>
          </CardTitle>
        </CardHeader>

        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-start text-xs text-ink-500">
                <th className="pb-2 text-start font-bold">{t.branches.colBranch}</th>
                <th className="pb-2 text-start font-bold">{t.branches.colLink}</th>
                <th className="pb-2 text-end font-bold">{t.branches.colOrders}</th>
                <th className="pb-2 text-end font-bold">{t.branches.colRevenue}</th>
                <th className="pb-2 text-end font-bold">{t.branches.colExpenses}</th>
                <th className="pb-2 text-end font-bold">{t.branches.colNet}</th>
              </tr>
            </thead>

            <tbody>
              {summary.sites.map((site) => (
                <tr key={site.id} className="border-b border-ink-100 last:border-0">
                  <td className="py-3">
                    <span className="font-bold text-ink-800">{site.name}</span>
                    {!site.isHeadOffice && (
                      <span className="ms-2 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-600">
                        {t.branches.branchBadge}
                      </span>
                    )}
                    {site.managerEmail && (
                      <span className="block text-xs text-ink-500" dir="ltr">
                        {site.managerEmail}
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <a
                      href={`/menu/${site.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-ink-600 underline underline-offset-2"
                      dir="ltr"
                    >
                      {`${env.NEXT_PUBLIC_APP_URL}/menu/${site.slug}`}
                    </a>
                  </td>
                  <td className="py-3 text-end tabular-nums">
                    {formatNumber(site.orders, locale)}
                  </td>
                  <td className="py-3 text-end tabular-nums">{money(site.revenue)}</td>
                  <td className="py-3 text-end tabular-nums">{money(site.expenses)}</td>
                  <td className="py-3 text-end font-bold tabular-nums">
                    {money(site.net)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-ink-200 font-bold">
                <td className="pt-3" colSpan={2}>
                  {t.branches.totalRow}
                </td>
                <td className="pt-3 text-end tabular-nums">
                  {formatNumber(summary.totals.orders, locale)}
                </td>
                <td className="pt-3 text-end tabular-nums">
                  {money(summary.totals.revenue)}
                </td>
                <td className="pt-3 text-end tabular-nums">
                  {money(summary.totals.expenses)}
                </td>
                <td className="pt-3 text-end tabular-nums">
                  {money(summary.totals.net)}
                </td>
              </tr>
            </tfoot>
          </table>

          {summary.sites.length === 1 && (
            <p className="mt-4 text-sm text-ink-500">{t.branches.empty}</p>
          )}
        </CardBody>
      </Card>

      <AddBranchForm baseUrl={env.NEXT_PUBLIC_APP_URL} />
    </div>
  );
}
