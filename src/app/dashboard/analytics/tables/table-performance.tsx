import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateShort, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fa";
import type { Locale } from "@/lib/i18n";
import type { TableActivityLevel, TableReport } from "@/lib/tables";

/**
 * Every table, side by side.
 *
 * A server component rendering figures the page already has — no state, nothing
 * for the client bundle to carry, the same shape as `ProductPerformanceTable`
 * next door.
 *
 * A table rather than a chart, for the same reason that one is: an owner
 * looking for table 12 wants to find the row called 12, not hunt for a dot.
 * Rows stay in the venue's own table order rather than sorting by takings, so
 * the screen reads like the room and a table does not move every time the
 * period changes.
 */

const ACTIVITY_TONE: Record<
  TableActivityLevel,
  "brand" | "success" | "warning" | "neutral"
> = {
  high: "success",
  medium: "brand",
  low: "warning",
  none: "neutral",
};

export function TablePerformanceTable({
  report,
  locale,
  t,
}: {
  report: TableReport;
  locale: Locale;
  t: Dictionary;
}) {
  const copy = t.tableIntel;

  /*
    The two visit columns appear only once the venue's traffic can actually be
    attributed to tables. Rendering them empty would ask the owner to work out
    why a column they can see has nothing in it, and would imply the platform
    had measured a zero rather than measured nothing.
  */
  const showVisits = report.views.status === "measured";
  const showTrend = report.rows.some((row) => row.trend !== null);

  if (report.rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{copy.title}</CardTitle>
          {showVisits && <p className="mt-0.5 text-xs text-ink-500">{copy.visitsNote}</p>}
        </div>
      </CardHeader>

      <CardBody>
        {/* Scrolls inside its own box on a narrow screen rather than widening
            the page — the same pattern the merchandising tables use. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-start text-xs text-ink-500">
                <th className="py-2 text-start font-semibold">{copy.columns.table}</th>
                <th className="py-2 text-start font-semibold">{copy.columns.orders}</th>
                <th className="py-2 text-start font-semibold">{copy.columns.revenue}</th>
                <th className="py-2 text-start font-semibold">
                  {copy.columns.averageOrderValue}
                </th>
                {showVisits && (
                  <>
                    <th className="py-2 text-start font-semibold">
                      {copy.columns.visits}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {copy.columns.perVisit}
                    </th>
                  </>
                )}
                {showTrend && (
                  <th className="py-2 text-start font-semibold">{copy.columns.trend}</th>
                )}
                <th className="py-2 text-start font-semibold">{copy.columns.activity}</th>
                <th className="py-2 text-start font-semibold">
                  {copy.columns.lastOrder}
                </th>
              </tr>
            </thead>

            <tbody>
              {report.rows.map((row) => (
                <tr key={row.key} className="border-b border-ink-100 last:border-0">
                  <td className="py-2.5 pe-3">
                    <span className="font-semibold text-ink-800">
                      {copy.columns.table} {row.number}
                    </span>
                    {row.label && (
                      <span className="block text-xs text-ink-500">{row.label}</span>
                    )}
                    {/* A number that orders name but the table list does not.
                        Flagged rather than hidden: the money is real, and only
                        the owner knows whether it is a deleted table or a typo. */}
                    {!row.listed && (
                      <Badge tone="neutral" title={copy.unlistedHint}>
                        {copy.unlisted}
                      </Badge>
                    )}
                  </td>

                  <td className="py-2.5 tabular-nums">
                    {formatNumber(row.orders, locale)}
                  </td>

                  <td className="py-2.5 font-semibold tabular-nums">
                    {formatMoney(row.revenue, locale)}
                  </td>

                  <td className="py-2.5 tabular-nums">
                    {row.orders > 0 ? formatMoney(row.averageOrderValue, locale) : "—"}
                  </td>

                  {showVisits && (
                    <>
                      <td className="py-2.5 tabular-nums">
                        {formatNumber(row.visits.views, locale)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {row.visits.ratio === null ? (
                          "—"
                        ) : (
                          <span
                            /*
                              Above 100% is real and is never clamped — the
                              table takes more orders than its own code is
                              opened, so some guests arrived another way. The
                              tooltip says exactly that rather than leaving an
                              owner to wonder whether the figure is broken.
                            */
                            title={row.visits.ratio > 1 ? copy.perVisitOver : undefined}
                          >
                            {formatPercent(row.visits.ratio, locale)}
                          </span>
                        )}
                      </td>
                    </>
                  )}

                  {showTrend && (
                    <td className="py-2.5 tabular-nums">
                      <TrendCell
                        delta={row.trend?.revenueDelta ?? null}
                        locale={locale}
                      />
                    </td>
                  )}

                  <td className="py-2.5">
                    {row.activity === null ? (
                      <span className="text-ink-400">{copy.activity.unknown}</span>
                    ) : (
                      <Badge tone={ACTIVITY_TONE[row.activity]}>
                        {copy.activity[row.activity]}
                      </Badge>
                    )}
                  </td>

                  <td className="py-2.5 text-xs text-ink-500">
                    {row.lastOrderAt ? (
                      // Dates read left-to-right even in an RTL column.
                      <span dir="ltr">{formatDateShort(row.lastOrderAt, locale)}</span>
                    ) : (
                      copy.noOrders
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * A period-over-period movement, or a dash where there is no baseline.
 *
 * Up and down are physical directions, so the arrows do not flip in RTL — the
 * same rule the analytics tiles follow.
 */
function TrendCell({ delta, locale }: { delta: number | null; locale: Locale }) {
  if (delta === null) return <span className="text-ink-400">—</span>;
  if (delta === 0) return <span className="text-ink-500">—</span>;

  const up = delta > 0;

  return (
    // The palette the stat tiles already use for the same meaning.
    <span className={up ? "text-emerald-700" : "text-red-700"}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(delta), locale)}
    </span>
  );
}
