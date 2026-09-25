import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fa";
import type { Locale } from "@/lib/i18n";
import type {
  MenuBenchmark,
  ProductPerformance,
  ProductQuadrant,
} from "@/lib/profitability";

/**
 * What each dish actually earns, next to how much of it sold.
 *
 * The screen the whole profitability layer exists to produce. Everything on it
 * is realised — computed from order snapshots, not from list prices — so a dish
 * discounted all month shows the margin it really achieved rather than the one
 * its price tag implies.
 *
 * A server component: it renders figures the page already has and has no state,
 * so there is nothing for the client bundle to carry.
 *
 * Deliberately a table rather than a scatter plot. A 2×2 chart looks like
 * management consulting and forces an owner to hunt for a dish by position; a
 * table sorted by what it earns puts the answer on the first row, and the
 * quadrant travels as a badge beside each name.
 */

/** Tone per quadrant, so the same standing reads the same way throughout. */
const QUADRANT_TONE: Record<
  ProductQuadrant,
  "brand" | "success" | "warning" | "neutral"
> = {
  star: "success",
  reviewPricing: "warning",
  promote: "brand",
  review: "neutral",
  unknown: "neutral",
  insufficient: "neutral",
};

export function ProductPerformanceTable({
  rows,
  benchmark,
  locale,
  t,
}: {
  rows: ProductPerformance[];
  benchmark: MenuBenchmark;
  locale: Locale;
  t: Dictionary;
}) {
  const a = t.analytics;

  /*
    Only dishes with something to say.

    A menu of sixty includes plenty that sold twice, and listing them pushes the
    ones that matter off the screen. The eight best earners is what an owner can
    actually act on in one sitting; the full list already exists on the finance
    page, which is where someone auditing every dish should be.
  */
  const worthShowing = rows.filter((row) => row.quadrant !== "insufficient");

  /*
    Uncosted dishes are always surfaced, even past the cap.

    They sort last — a null gross profit cannot rank — so on a menu with more
    dishes than slots they fell off the bottom. That hid the one thing an owner
    can actually fix: observed with a drink selling steadily at no recorded
    cost, invisible here *and* silent in the insights, because at 2% of revenue
    the cost-coverage rule correctly stayed quiet. Between the two the dish
    simply did not exist. Listing it costs a row and closes the gap.
  */
  const capped = worthShowing.slice(0, 8);
  const hiddenUncosted = worthShowing
    .slice(8)
    .filter((row) => row.quadrant === "unknown");

  const shown = [...capped, ...hiddenUncosted];

  if (shown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{a.productPerformance}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-ink-500">{a.productPerformanceEmpty}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{a.productPerformance}</CardTitle>
        {/*
          The bar every row is judged against, stated rather than implied —
          otherwise "low margin" is an assertion the owner cannot check.

          `typicalMargin`, not `menuMargin`. This header sits directly above the
          rows it explains and the insights quote the same figure, so showing
          the weighted mean here printed two different numbers both labelled
          "menu average" on one screen — 44.7% in this header against 62.8% in
          the insight below it. The weighted average is a real and useful
          figure, but it belongs with the venue's P&L on the finance page, which
          already reports it; here it was just a second thing with the same name.
        */}
        {benchmark.typicalMargin !== null && (
          <span className="text-xs font-semibold text-ink-500">
            {a.typicalProductMargin}: {formatPercent(benchmark.typicalMargin, locale)}
          </span>
        )}
      </CardHeader>
      <CardBody>
        {/* Its own scroller, so the page itself never scrolls sideways at
            320px — the same pattern the customer table already uses. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-xs text-ink-500">
                <th className="py-2 text-start font-semibold">{a.product}</th>
                <th className="py-2 text-end font-semibold">{a.units}</th>
                <th className="py-2 text-end font-semibold">{a.revenue}</th>
                <th className="py-2 text-end font-semibold">{a.grossProfit}</th>
                <th className="py-2 text-end font-semibold">{a.margin}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.key} className="border-b border-ink-100 last:border-0">
                  <td className="py-2.5 pe-3">
                    <span className="font-semibold text-ink-800">{row.name}</span>
                    {/*
                      The quadrant as a word, not only as a colour — an owner
                      who cannot distinguish the tones still reads the label.
                      `review` and `insufficient` get no badge: "ordinary" is
                      not worth a pill on every other row.
                    */}
                    {row.quadrant !== "review" && (
                      <span className="mt-0.5 block">
                        <Badge tone={QUADRANT_TONE[row.quadrant]}>
                          {a.quadrants[row.quadrant]}
                        </Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-end tabular-nums">
                    {formatNumber(row.quantity, locale)}
                  </td>
                  <td className="py-2.5 text-end tabular-nums">
                    {formatMoney(row.revenue, locale)}
                  </td>
                  {/*
                    An em dash where cost is unrecorded, never a zero.

                    Zero would read as "this dish earns nothing", which is a
                    claim about the business; the dash says the platform does
                    not know, which is the truth.
                  */}
                  <td className="py-2.5 text-end font-semibold tabular-nums">
                    {row.grossProfit === null
                      ? "—"
                      : formatMoney(row.grossProfit, locale)}
                  </td>
                  <td className="py-2.5 text-end tabular-nums">
                    {row.margin === null ? "—" : formatPercent(row.margin, locale)}
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
