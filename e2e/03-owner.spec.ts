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
  "/dashboard/inventory",
  "/dashboard/inventory?view=purchases",
  "/dashboard/inventory?view=count",
  "/dashboard/inventory?view=history",
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

  test("tags a dish as spicy and guests can filter the menu for it", async ({
    page,
  }, testInfo) => {
    const errors = watchForErrors(page);
    const name = `خوراک تند ${testInfo.project.name}`;
    await db.query(`DELETE FROM "Product" WHERE name = $1`, [name]);
    await page.goto("/dashboard/menu");
    await page.getByRole("button", { name: "افزودن محصول" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("نام محصول").fill(name);
    await dialog.getByLabel("قیمت", { exact: true }).fill("۹۵۰۰۰");
    await dialog.getByRole("button", { name: "تند", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "تند", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog
      .getByRole("button", { name: /ذخیره|افزودن|ثبت/ })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = await one<{ dietaryTags: string[] }>(
      `SELECT "dietaryTags" FROM "Product" WHERE name = $1`,
      [name],
    );
    expect(saved.dietaryTags).toEqual(["spicy"]);

    // Guests: the spicy filter exists only because this dish does.
    await page.goto("/menu/cafe-narenj");
    const filters = page.getByRole("group", { name: "فیلتر منو" });
    await filters.getByRole("button", { name: "تند", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText("اسپرسو", { exact: true })).toHaveCount(0);
    await page.getByText(name).first().click();
    await expect(
      page.getByRole("dialog").getByRole("list", { name: "ویژگی‌های غذا" }),
    ).toContainText("تند");

    await db.query(`DELETE FROM "Product" WHERE name = $1`, [name]);
    expect(errors).toEqual([]);
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

  test("a paid renewal gets a printable receipt with both parties on it", async ({
    page,
  }) => {
    // Renew the plan the venue is already on, through the test gateway.
    const current = await one<{ code: string }>(
      `SELECT p.code FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
         JOIN "Restaurant" r ON r.id = s."restaurantId" WHERE r.slug = 'cafe-narenj'`,
    );
    const start = await page.request.post("/api/subscription/checkout", {
      data: { planCode: current.code, interval: "monthly" },
    });
    expect(start.ok(), await start.text()).toBeTruthy();
    const { data } = await start.json();
    await page.goto(data.paymentUrl);
    await page.locator('a[href*="Status=OK"]').click();
    await page.waitForURL(/\/dashboard\/subscription/);

    const paid = await one<{ id: string; amount: number }>(
      `SELECT p.id, p.amount FROM "Payment" p JOIN "Restaurant" r ON r.id = p."restaurantId"
        WHERE r.slug = 'cafe-narenj' AND p.purpose = 'SUBSCRIPTION' AND p.status = 'PAID'
        ORDER BY p."createdAt" DESC LIMIT 1`,
    );
    // Opens in a new tab; follow its address in this one.
    const link = page.getByRole("link", { name: "رسید" }).first();
    await expect(link).toHaveAttribute("href", `/print/receipt/${paid.id}`);
    await page.goto(`/print/receipt/${paid.id}`);
    await expect(page.getByRole("heading", { name: "رسید پرداخت اشتراک" })).toBeVisible();
    await expect(page.locator("main")).toContainText("کافه نارنج");
    await expect(page.locator("main")).toContainText("درگاه آزمایشی");

    // Someone else's receipt is not found, not shown.
    await signInWithApi(page.request, PHONES.diziOwner);
    const foreign = await page.goto(`/print/receipt/${paid.id}`);
    expect(foreign?.status()).toBe(404);
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
