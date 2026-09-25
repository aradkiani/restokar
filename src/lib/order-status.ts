import { Prisma } from "@/generated/prisma/client";

/**
 * Which orders count as business.
 *
 * One definition, in the two forms the codebase actually queries with. Before
 * this module the rule was written out nine times across eight files — some as
 * a Prisma `where` fragment, some as raw SQL — and every report that touched
 * revenue, customers, merchandising or campaigns carried its own copy. Nothing
 * had gone wrong yet, but nothing was stopping it: a change of mind about, say,
 * whether refunded orders still count would have had to find all nine.
 *
 * Deliberately its own module rather than an export from `analytics.ts`. Half
 * the callers do not otherwise import the reporting layer, and `analytics.ts`
 * pulls in Prisma and `server-only`; hanging a shared constant off it would
 * make every consumer take that dependency to ask one question.
 *
 * ### What the rule is, and what it is not
 *
 * **Cancelled orders are excluded. Everything else counts.**
 *
 * `CANCELED` is terminal and covers refunds too — a refunded order was
 * cancelled first — so there is no second rule for money that went back.
 *
 * Orders still in the kitchen (`RECEIVED`, `PREPARING`, `READY`) *do* count.
 * They are real sales in progress, and excluding them would make the day's
 * takings climb only at the end of service and a venue's regulars vanish until
 * their meal was handed over.
 *
 * Spelled `CANCELED`, one L, matching `OrderStatus.CANCELED` in the schema.
 */

/** The Prisma form, for `where: { restaurantId, ...COUNTED_ORDER }`. */
export const COUNTED_ORDER = {
  status: { not: "CANCELED" },
} as const satisfies Prisma.OrderWhereInput;

/**
 * The SQL form, for the handful of reports that aggregate in the database.
 *
 * Takes the table alias because the queries that need it join orders under
 * different names — `o`, `o2`. Passing the alias rather than hard-coding one
 * keeps this usable from all of them without a second constant.
 */
export function countedOrderSql(alias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`"${alias}"`)}."status" <> 'CANCELED'`;
}
