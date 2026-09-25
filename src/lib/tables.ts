/**
 * What a table is worth, and how confidently the platform can say so.
 *
 * The gap this fills, stated plainly: the platform already knows what sold
 * (`analytics.ts`), which dish earns (`profitability.ts`) and who came back
 * (`retention.ts`) — but **nothing reads the room.** Every order has carried a
 * `tableNumber` since the first QR code was printed, and 98% of them are filled
 * in, yet no screen groups by it. An owner can see that Thursday is busy and
 * that the burger sells; no screen tells them table 12 has taken four orders
 * this month while table 10 took ninety.
 *
 * Free of database and framework imports, like `pricing.ts`, `profitability.ts`
 * and `retention.ts`. Everything here is arithmetic over figures the reporting
 * layer already aggregates, which is what lets the rules be tested without a
 * database or a browser.
 *
 * ### What a "table" is here
 *
 * `Order.tableNumber` is free text, not a foreign key, and that is deliberate
 * upstream: a printed QR code outlives the row an owner may delete, and an
 * order must never be refused because a table was renamed. So a table in this
 * module is the **(venue, number) pair**, which `RestaurantTable` already
 * treats as unique. Two consequences, both handled below:
 *
 *   * A number may have orders and no `RestaurantTable` row — a table deleted
 *     since, or a guest who typed one that was never configured. It is reported
 *     as `listed: false` rather than dropped, because the money is real.
 *   * Branch isolation is free. A branch is a full tenant with its own
 *     `restaurantId`, its own tables and its own orders, so "table 1" at two
 *     branches of a chain are already two different rows and never meet.
 *
 * ### Descriptive, never causal
 *
 * Nothing here concludes *why* a table is quiet. A table beside the kitchen
 * door, a table nobody is seated at, and a table whose QR sticker has peeled
 * off produce the same row. The report says what happened; the owner knows
 * which of those it is, and this module must not guess on their behalf.
 */

// ------------------------------- thresholds --------------------------------

/**
 * The floors below which a table's figures are not worth judging.
 *
 * Deliberately aligned with `INSIGHT_THRESHOLDS` in `sales-insights.ts` and
 * `PROFITABILITY_THRESHOLDS` in `profitability.ts` rather than freshly
 * invented — those modules already chose these numbers against the scale this
 * product runs at, and a third idea of "enough data" would let three screens
 * disagree about whether the same venue has enough history to be told anything.
 */
export const TABLE_THRESHOLDS = {
  /**
   * Orders a venue needs in the window before any table is called busy or quiet.
   *
   * Ten, matching `INSIGHT_THRESHOLDS.minOrdersPerPeriod`. Below it the busiest
   * table in the venue is whichever one took three orders instead of two.
   */
  minOrdersForBands: 10,

  /**
   * Tables a venue needs before "high" and "low" can be relative terms.
   *
   * Four, on the same reasoning as `minProductsForMatrix`: below that there is
   * no middle for anything to be above or below, and the bands would be
   * ranking three tables rather than describing them.
   */
  minTablesForBands: 4,

  /**
   * Share of the venue's orders a table needs to count as busy.
   *
   * Above its "fair share" — what it would take if every active table took the
   * same number — by half again. The same factor and the same reasoning as
   * `PROFITABILITY_THRESHOLDS.highVolumeShareFactor`: scaling to the venue's
   * own size means one constant works for a 6-table café and a 40-table
   * restaurant.
   */
  highActivityShareFactor: 1.5,

  /** And the mirror: at or under half of what an even table would take. */
  lowActivityShareFactor: 0.5,

  /**
   * Menu opens a table needs before its orders-per-visit figure is shown.
   *
   * Thirty, matching `INSIGHT_THRESHOLDS.minImpressions` — the same floor the
   * merchandising rules use before they will judge a promoted dish, and for the
   * same reason: a ratio over four sightings is noise wearing a percentage.
   */
  minViewsForRatio: 30,

  /**
   * Share of a venue's menu opens that must carry a table before the
   * visit-based figures describe the venue rather than a corner of it.
   *
   * Half. A venue whose menu is mostly opened from a link in its Instagram bio
   * has real traffic that belongs to no table, and reporting table conversion
   * as though that traffic did not exist would flatter every table in the room.
   */
  minViewCoverage: 0.5,

  /** Tables whose combined share counts as concentration worth naming. */
  concentrationTopN: 3,
  concentrationShare: 0.5,
} as const;

// ---------------------------------- types ----------------------------------

/**
 * A table as the owner configured it, from `RestaurantTable`.
 *
 * The identity that survives a rename: `id` is what the report keys on when it
 * has one, because `number` is a display value an owner may reuse.
 */
export interface ConfiguredTable {
  id: string;
  number: string;
  label: string | null;
  seats: number | null;
}

/**
 * What one table's orders came to, already aggregated by the server.
 *
 * No unit count. Units sold per table would need `OrderItem` joined back to its
 * order's table number, and the only cheap way to get that is to widen the
 * cached item read the main analytics page shares — paying for a relation fetch
 * on every analytics request to answer a question this report does not need.
 * Orders, revenue and average ticket already say how busy a table is.
 */
export interface TableOrderTotals {
  tableNumber: string;
  orders: number;
  /** Net of tax and tip, as `netRevenue` in analytics.ts defines it. */
  revenue: number;
  lastOrderAt: Date | null;
}

/** Menu opens attributed to one table, from `MenuDailyView`. */
export interface TableViewTotals {
  tableNumber: string;
  views: number;
}

/**
 * How busy a table is relative to the venue's other active tables.
 *
 * Relative, never absolute: forty orders a month is busy for a two-cover
 * window seat and dead for the big table by the window. `null` means the venue
 * does not yet have enough trade for the comparison to describe anything.
 */
export type TableActivityLevel = "high" | "medium" | "low" | "none";

/**
 * Whether a figure is measured or simply not yet knowable.
 *
 * Two states, not three. There is deliberately no "estimated": every number on
 * this report is counted from rows the platform holds, and the moment one is
 * inferred instead it stops being something an owner can check. A figure the
 * data cannot support is withheld rather than approximated.
 */
export type TableDataQuality = "measured" | "insufficientData";

/**
 * Orders set against the menu opens that came through the same table's code.
 *
 * **Not a conversion rate, and named so it cannot be read as one.** Both
 * figures are real counts for the same table over the same window, but they
 * are not two stages of one funnel:
 *
 *   * A view is a page load, not a person. Four guests at one table opening the
 *     menu on four phones and sharing one order is four views and one order.
 *   * An order can arrive with no view behind it — a guest who opened the
 *     venue's plain link, or was handed a phone, and typed the table number at
 *     checkout.
 *
 * So the ratio can exceed 1, and it is never clamped. `merchandising.ts` was
 * carrying exactly that bug until Part 1 — order lines over guest sessions,
 * presented as a percentage and silently capped at 100% — and clamping here
 * would rebuild it. A figure above 100% is information: that table takes more
 * orders than its own QR code is opened, so its guests are arriving another
 * way.
 */
export interface TableVisitRatio {
  status: TableDataQuality;
  views: number;
  orders: number;
  /** Orders per menu open. Null while `status` is `insufficientData`. */
  ratio: number | null;
}

/**
 * The same table, one comparison window earlier.
 *
 * The two totals are named for the window they describe rather than left as
 * `orders` and `revenue`. A `trend.revenue` sitting beside a row's own
 * `revenue` reads as this period's figure at a glance, and a rule subtracting
 * them the wrong way round would report every growing table as declining.
 */
export interface TableTrend {
  previousOrders: number;
  previousRevenue: number;
  /** Fractions from `ratioDelta`, or null where there is no baseline. */
  ordersDelta: number | null;
  revenueDelta: number | null;
}

export interface TablePerformanceRow {
  /** Stable across runs: the table's id, or `unlisted:<number>` without one. */
  key: string;
  /** `RestaurantTable.id`, or null for a number with no configured table. */
  id: string | null;
  number: string;
  label: string | null;
  seats: number | null;
  /**
   * False when orders name this number but no `RestaurantTable` row does.
   *
   * Shown rather than hidden: the revenue is real and the owner is the only one
   * who knows whether it is a deleted table, a typo, or a table they never got
   * round to adding.
   */
  listed: boolean;

  orders: number;
  revenue: number;
  /** Rounded whole Toman, as `analytics.ts` defines the platform's AOV. */
  averageOrderValue: number;
  lastOrderAt: Date | null;

  /** Share of the venue's table-attributed revenue in the window. */
  revenueShare: number;
  /** Null when the venue lacks the trade for bands to describe anything. */
  activity: TableActivityLevel | null;

  visits: TableVisitRatio;
  trend: TableTrend | null;
}

export interface TableReport {
  rows: TablePerformanceRow[];

  /** Whether the activity bands on the rows mean anything yet. */
  activityStatus: TableDataQuality;

  totals: {
    /** Tables that took an order or an opened menu in the window. */
    activeTables: number;
    /** Every table in the report, configured or merely seen in an order. */
    reportedTables: number;
    orders: number;
    revenue: number;
  };

  views: {
    /** Menu opens that named a table. */
    attributed: number;
    /** Menu opens that named none — a plain link, or a code without a table. */
    unattributed: number;
    /** `attributed / (attributed + unattributed)`, or null with no views yet. */
    coverage: number | null;
    /**
     * Whether the visit figures describe the venue's traffic or a corner of it.
     *
     * `insufficientData` both when nothing has been recorded and when most
     * traffic arrived without a table, because the two are indistinguishable to
     * an owner reading a ratio and equally misleading.
     */
    status: TableDataQuality;
  };
}

// ------------------------------- classification -----------------------------

/** The key a row is identified by, so React and the tests agree on one form. */
export function tableKey(table: { id: string | null; number: string }): string {
  return table.id ?? `unlisted:${table.number}`;
}

/**
 * Where a table sits against an evenly-busy one.
 *
 * `fairShare` is the venue's orders divided by its *active* tables, not by
 * every table it has configured. A venue that set up a terrace it does not open
 * in winter would otherwise have its whole indoor room read as busy, because
 * the twelve dormant tables dragged the average down. Dormant tables are
 * reported at `none` on their own account, which is the honest way to say it.
 */
export function classifyActivity(orders: number, fairShare: number): TableActivityLevel {
  if (orders <= 0) return "none";
  if (fairShare <= 0) return "none";

  const index = orders / fairShare;
  if (index >= TABLE_THRESHOLDS.highActivityShareFactor) return "high";
  if (index <= TABLE_THRESHOLDS.lowActivityShareFactor) return "low";
  return "medium";
}

/** Orders against the opens of the same table's code. See `TableVisitRatio`. */
export function assessVisitRatio(views: number, orders: number): TableVisitRatio {
  if (views < TABLE_THRESHOLDS.minViewsForRatio) {
    return { status: "insufficientData", views, orders, ratio: null };
  }

  return { status: "measured", views, orders, ratio: orders / views };
}

// --------------------------------- the report -------------------------------

export interface TableReportInput {
  /** The venue's configured tables, in the order they should be shown. */
  configured: readonly ConfiguredTable[];
  current: readonly TableOrderTotals[];
  /** The equally long window before it, for the trend. Absent = no trend. */
  previous?: readonly TableOrderTotals[];
  views?: readonly TableViewTotals[];
  /** `MenuDailyView`'s sentinel for an open that named no table. */
  untabledViewKey?: string;
  /**
   * Proportional change, injected rather than imported.
   *
   * This module is a leaf by design — `profitability.ts` next door imports
   * nothing either — and `ratioDelta` lives in `sales-insights.ts`. Taking it
   * as an argument keeps the one definition of "how much did this move" that
   * the rest of the platform already uses, without this module reaching
   * upwards for it.
   */
  delta: (current: number, previous: number) => number | null;
}

/**
 * Everything the table report shows, from figures the server has aggregated.
 *
 * One pass, no database, no formatting. The caller supplies sums; this decides
 * what they mean and what may honestly be said about them.
 */
export function buildTableReport(input: TableReportInput): TableReport {
  const untabledKey = input.untabledViewKey ?? "";

  const currentByNumber = new Map(input.current.map((row) => [row.tableNumber, row]));
  const previousByNumber = new Map(
    (input.previous ?? []).map((row) => [row.tableNumber, row]),
  );

  let attributedViews = 0;
  let unattributedViews = 0;
  const viewsByNumber = new Map<string, number>();

  for (const row of input.views ?? []) {
    if (row.tableNumber === untabledKey) {
      unattributedViews += row.views;
      continue;
    }
    attributedViews += row.views;
    viewsByNumber.set(row.tableNumber, row.views);
  }

  /*
    Every table the window can speak about: the ones the owner configured, plus
    any number that orders or views name without one. Configured tables come
    first and keep their own order, so the report reads like the venue's own
    table list rather than a leaderboard that reshuffles every day.
  */
  const numbers: string[] = input.configured.map((table) => table.number);
  const seen = new Set(numbers);

  for (const number of [...currentByNumber.keys(), ...viewsByNumber.keys()]) {
    if (number === untabledKey || seen.has(number)) continue;
    seen.add(number);
    numbers.push(number);
  }

  const configuredByNumber = new Map(
    input.configured.map((table) => [table.number, table]),
  );

  let totalOrders = 0;
  let totalRevenue = 0;
  let activeTables = 0;

  for (const number of numbers) {
    const totals = currentByNumber.get(number);
    const views = viewsByNumber.get(number) ?? 0;

    totalOrders += totals?.orders ?? 0;
    totalRevenue += totals?.revenue ?? 0;
    if ((totals?.orders ?? 0) > 0 || views > 0) activeTables += 1;
  }

  /*
    Bands need both a busy enough venue and enough tables to have a middle.
    Failing either, the rows still carry their counts — those are facts — but
    nothing is badged busy or quiet, because with eight orders across three
    tables that badge would be describing a rota rather than the room.
  */
  const bandable =
    totalOrders >= TABLE_THRESHOLDS.minOrdersForBands &&
    activeTables >= TABLE_THRESHOLDS.minTablesForBands;

  const fairShare = activeTables > 0 ? totalOrders / activeTables : 0;

  const totalViews = attributedViews + unattributedViews;
  const coverage = totalViews > 0 ? attributedViews / totalViews : null;
  const viewStatus: TableDataQuality =
    coverage !== null && coverage >= TABLE_THRESHOLDS.minViewCoverage
      ? "measured"
      : "insufficientData";

  const rows = numbers.map((number): TablePerformanceRow => {
    const configured = configuredByNumber.get(number) ?? null;
    const totals = currentByNumber.get(number);
    const previous = previousByNumber.get(number);
    const views = viewsByNumber.get(number) ?? 0;

    const orders = totals?.orders ?? 0;
    const revenue = totals?.revenue ?? 0;

    /*
      The ratio is withheld unless the venue's traffic is mostly attributable.
      A table can clear its own 30-view floor inside a venue whose menu is
      opened five times as often from a link nobody can place — and a ratio that
      looked precise in that room would be measuring the wrong denominator.
    */
    const visits =
      viewStatus === "measured"
        ? assessVisitRatio(views, orders)
        : { status: "insufficientData" as const, views, orders, ratio: null };

    return {
      key: tableKey({ id: configured?.id ?? null, number }),
      id: configured?.id ?? null,
      number,
      label: configured?.label ?? null,
      seats: configured?.seats ?? null,
      listed: configured !== null,

      orders,
      revenue,
      averageOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
      lastOrderAt: totals?.lastOrderAt ?? null,

      revenueShare: totalRevenue > 0 ? revenue / totalRevenue : 0,
      /*
        "None" is a fact, the other three are judgements.

        A table that took no orders took no orders, and saying so needs no
        comparison against its neighbours — so it is reported even in a venue
        too quiet for the bands. Busy and quiet are relative terms and stay
        withheld until there is a room to be relative to.
      */
      activity:
        orders === 0 ? "none" : bandable ? classifyActivity(orders, fairShare) : null,

      visits,
      trend: input.previous
        ? {
            previousOrders: previous?.orders ?? 0,
            previousRevenue: previous?.revenue ?? 0,
            ordersDelta: input.delta(orders, previous?.orders ?? 0),
            revenueDelta: input.delta(revenue, previous?.revenue ?? 0),
          }
        : null,
    };
  });

  return {
    rows,
    activityStatus: bandable ? "measured" : "insufficientData",
    totals: {
      activeTables,
      reportedTables: rows.length,
      orders: totalOrders,
      revenue: totalRevenue,
    },
    views: {
      attributed: attributedViews,
      unattributed: unattributedViews,
      coverage,
      status: viewStatus,
    },
  };
}

/**
 * How much of a venue's table revenue rests on its few busiest tables.
 *
 * The same shape as `menuConcentration` in `profitability.ts`, and named the
 * same way on purpose — it is the same question asked of a different axis. Only
 * meaningful once there are more tables than the top slice counts, which is
 * what the guard below refuses.
 */
export interface TableConcentration {
  topShare: number;
  tables: string[];
}

export function assessTableConcentration(
  rows: readonly TablePerformanceRow[],
): TableConcentration | null {
  const earning = rows.filter((row) => row.revenue > 0);
  if (earning.length <= TABLE_THRESHOLDS.concentrationTopN) return null;

  const ranked = [...earning].sort((a, b) => b.revenue - a.revenue);
  const top = ranked.slice(0, TABLE_THRESHOLDS.concentrationTopN);

  const total = earning.reduce((sum, row) => sum + row.revenue, 0);
  if (total <= 0) return null;

  const topShare = top.reduce((sum, row) => sum + row.revenue, 0) / total;
  if (topShare < TABLE_THRESHOLDS.concentrationShare) return null;

  return { topShare, tables: top.map((row) => row.number) };
}
