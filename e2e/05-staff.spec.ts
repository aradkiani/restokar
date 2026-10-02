import { expect, test } from "@playwright/test";
import { PHONES, one } from "./support/env";
import { signInWithApi, watchForErrors } from "./support/session";

test.describe("staff and branch roles", () => {
  test("a barista works the order board on a phone", async ({ page }) => {
    const errors = watchForErrors(page);
    await signInWithApi(page.request, PHONES.narenjBarista);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/orders/);
    const start = page.getByRole("button", { name: "شروع آماده‌سازی" }).first();
    if (await start.count()) {
      await start.click();
      await expect(page.getByRole("button", { name: "آماده شد" }).first()).toBeVisible();
    }
    const finance = await page.goto("/dashboard/finance");
    expect(finance?.url()).not.toContain("/dashboard/finance");
    expect(errors).toEqual([]);
  });

  test("menu-only staff cannot read orders through the API", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjMenuStaff);
    const response = await page.request.get("/api/orders?scope=all");
    expect(response.status()).toBe(403);
  });

  test("menu-only staff cannot change an order's status", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjMenuStaff);
    const order = await one<{ id: string }>(
      `SELECT o.id FROM "Order" o JOIN "Restaurant" r ON r.id = o."restaurantId"
        WHERE r.slug = 'cafe-narenj' AND o.status = 'DELIVERED' LIMIT 1`,
    );
    const response = await page.request.patch(`/api/orders/${order.id}/status`, {
      data: { status: "DELIVERED" },
    });
    expect(response.status()).toBe(403);
  });

  test("an accountant can open the printable financial report", async ({ page }) => {
    await signInWithApi(page.request, PHONES.diziAccountant);
    await page.goto("/dashboard/finance");
    await expect(page).toHaveURL(/\/dashboard\/finance/);
    await page.goto("/dashboard/finance/report");
    await expect(page).toHaveURL(/\/dashboard\/finance\/report/);
  });

  test("a branch manager's home shows only what they can use", async ({ page }) => {
    await signInWithApi(page.request, PHONES.vanakManager);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "افزودن محصول" })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("۰ محصولات");
  });

  test("a branch manager cannot edit the chain's menu", async ({ page }) => {
    await signInWithApi(page.request, PHONES.vanakManager);
    const response = await page.request.post("/api/products", {
      data: { name: "x", price: 1, categoryId: "x" },
    });
    expect(response.status()).toBe(403);
    await page.goto("/dashboard/menu");
    await expect(page).not.toHaveURL(/\/dashboard\/menu$/);
  });
});
