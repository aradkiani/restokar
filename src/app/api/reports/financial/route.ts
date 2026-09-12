import { fail, ok, parseQuery, route } from "@/lib/api";
import { requireTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { buildFinancialReport } from "@/lib/reports";
import {
  isWindowTooWide,
  resolveReportWindow,
  MAX_REPORT_DAYS,
} from "@/lib/report-range";
import { ReportQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Financial report data for the *authenticated* restaurant.
 *
 * Powers the on-screen preview before an owner commits to generating a
 * document. The tenant comes from requireTab("finance") — the query string carries
 * only dates — so there is no parameter a caller could change to read another
 * restaurant's figures.
 *
 * Owner-only rather than any tenant member: this exposes cost prices, margins
 * and expenses, which kitchen staff have no business seeing.
 */
export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireTab("finance");
  const query = parseQuery(request, ReportQuerySchema);
  const { range, preset } = resolveReportWindow(query);

  if (isWindowTooWide(range)) {
    return fail(
      422,
      `Report window may not exceed ${MAX_REPORT_DAYS} days`,
      "RANGE_TOO_WIDE",
    );
  }

  const { locale } = await getI18n();
  const report = await buildFinancialReport(restaurantId, range, preset, locale);

  return ok(report);
});
