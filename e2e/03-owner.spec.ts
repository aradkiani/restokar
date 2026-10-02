import { expect, test } from "@playwright/test";
import { PHONES, db, one } from "./support/env";
import { signInWithApi, watchForErrors } from "./support/session";

const OWNER_PAGES = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/orders/new",
  "/dashboard/menu",
  "/dashboard/menu/merchandising",
  "/dashboard/design",
  "/dashboard/qr",
  "/dashboard/analytics",
  "/dashboard/analytics/tables",
  "/dashboard/finance",
  "/dashboard/finance/report",
  "/dashboard/customers",
  "/dashboard/campaigns",
  "/dashboard/settings",
  "/dashboard/subscription",
  "/dashboard/options",
  "/dashboard/options/discounts",
  "/dashboard/options/inventory",
  "/dashboard/options/reviews",
  "/dashboard/options/staff",
  "/dashboard/options/support",
];

test.describe("active owner (cafe-narenj, small plan)", () => {
  test.beforeEach(async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
  });

  test("every dashboard page opens without errors and fits a phone", async ({ page }) => {
    const errors = watchForErrors(page);
    for (const path of OWNER_PAGES) {
      const response = await page.goto(path);
      expect.soft(response?.status(), path).toBe(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect.soft(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });

  test("adds a dish and sees it on the public menu", async ({ page }, testInfo) => {
    const name = `کیک هویج ${testInfo.project.name}`;
    await db.query(`DELETE FROM "Product" WHERE name = $1`, [name]);
    await page.goto("/dashboard/menu");
    await page.getByRole("button", { name: "افزودن محصول" }).first().click();
    await page.getByLabel("نام محصول").fill(name);
    await page.getByLabel("قیمت", { exact: true }).fill("۱۲۵۰۰۰");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /ذخیره|افزودن|ثبت/ })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = await one<{ price: number }>(
      `SELECT price FROM "Product" WHERE name = $1`,
      [name],
    );
    expect(saved.price).toBe(125_000);
    await page.goto("/menu/cafe-narenj");
    await expect(page.locator("main, body").first()).toContainText(name);
    await db.query(`DELETE FROM "Product" WHERE name = $1`, [name]);
  });

  test("the table limit is explained, not a silent failure", async ({ page }) => {
    const response = await page.request.post("/api/tables", { data: { number: "99" } });
    expect(response.status()).toBe(402);
    expect(await response.text()).toContain("میز");
  });

  test("the QR page shows one code per table", async ({ page }) => {
    await page.goto("/dashboard/qr");
    await expect(page.locator("main img[src^='data:image']").first()).toBeVisible();
  });

  test("low stock is flagged on the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toContainText("شکلات تلخ");
  });

  test("abandoning a plan purchase leaves the current plan unchanged", async ({
    page,
  }) => {
    const before = await one<{ code: string }>(
      `SELECT p.code FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
         JOIN "Restaurant" r ON r.id = s."restaurantId" WHERE r.slug = 'cafe-narenj'`,
    );
    const start = await page.request.post("/api/subscription/checkout", {
      data: { planCode: "tier-large", interval: "monthly" },
    });
    expect(start.ok(), await start.text()).toBeTruthy();
    // The owner closes the gateway tab without paying.
    const after = await one<{ code: string }>(
      `SELECT p.code FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
         JOIN "Restaurant" r ON r.id = s."restaurantId" WHERE r.slug = 'cafe-narenj'`,
    );
    const restore = async () =>
      db.query(
        `UPDATE "Subscription" SET "planId" = (SELECT id FROM "Plan" WHERE code = $1), interval = 'monthly'
          WHERE "restaurantId" = (SELECT id FROM "Restaurant" WHERE slug = 'cafe-narenj')`,
        [before.code],
      );
    await restore();
    expect(after.code).toBe(before.code);
  });

  test("a contract-only plan cannot be bought online", async ({ page }) => {
    const response = await page.request.post("/api/subscription/checkout", {
      data: { planCode: "tier-chain", interval: "monthly" },
    });
    await db.query(
      `UPDATE "Subscription" SET "planId" = (SELECT id FROM "Plan" WHERE code = 'tier-small')
        WHERE "restaurantId" = (SELECT id FROM "Restaurant" WHERE slug = 'cafe-narenj')`,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
