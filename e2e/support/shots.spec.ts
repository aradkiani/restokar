import { test } from "@playwright/test";
import { PHONES } from "./env";
import { signInWithApi } from "./session";

/**
 * Diagnostic, not a journey: screenshots of the screens the demo data feeds,
 * for a person to look at. Run with
 *   SHOTS_DIR=… npx playwright test e2e/support/shots.spec.ts --project=desktop
 */
const SHOTS: [string, string, string][] = [
  [PHONES.chainOwner, "/dashboard", "chain-dashboard"],
  [PHONES.chainOwner, "/dashboard/options/staff", "chain-staff"],
  [PHONES.chainOwner, "/dashboard/branches", "chain-branches"],
  [PHONES.largeOwner, "/dashboard/settings", "large-settings"],
  [PHONES.largeOwner, "/dashboard/analytics", "large-analytics"],
  [PHONES.largeOwner, "/dashboard/finance", "large-finance"],
  [PHONES.largeOwner, "/dashboard/orders/close", "large-till"],
  [PHONES.largeOwner, "/dashboard/inventory", "large-inventory"],
  [PHONES.largeOwner, "/dashboard/customers", "large-customers"],
  [PHONES.smallOwner, "/dashboard", "small-dashboard"],
  [PHONES.mediumOwner, "/dashboard/analytics?period=last90", "medium-analytics"],
];

test("screens fed by the demo data", async ({ page }) => {
  test.skip(!process.env.SHOTS_DIR, "diagnostic; set SHOTS_DIR to run");
  test.setTimeout(240_000);
  let current = "";
  for (const [phone, path, name] of SHOTS) {
    if (phone !== current) {
      await page.context().clearCookies();
      await signInWithApi(page.request, phone);
      current = phone;
    }
    await page.goto(path.replace(/^\//, "/"));
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `${process.env.SHOTS_DIR}/${name}.png`,
      fullPage: true,
    });
  }
});
