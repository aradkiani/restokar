import { expect, test } from "@playwright/test";
import { PHONES } from "./support/env";
import { signInWithApi } from "./support/session";

test.describe("owners in special states", () => {
  test("a trial ending in two days is announced in the dashboard", async ({ page }) => {
    await signInWithApi(page.request, PHONES.trialOwner);
    await page.goto("/dashboard");
    await expect(page.getByText(/اشتراک شما به‌زودی تمام می‌شود/)).toBeVisible();
    await expect(page.getByRole("link", { name: "تمدید اشتراک" })).toBeVisible();
  });

  test("a menu-only venue shows its menu but takes no orders", async ({ page }) => {
    await page.goto("/menu/cafe-varagh");
    await expect(page.locator("body")).toContainText("اسپرسو");
    const order = await page.request.post("/api/public/orders", {
      data: {
        slug: "cafe-varagh",
        tableNumber: "1",
        customerName: "مهمان",
        items: [{ productId: "x", quantity: 1 }],
      },
    });
    expect(order.status()).toBeGreaterThanOrEqual(400);
  });

  test("an expired owner is told clearly and can renew", async ({ page }) => {
    await signInWithApi(page.request, PHONES.expiredOwner);
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText(/منقضی|پایان|تمدید/);
    await page.goto("/dashboard/subscription");
    await expect(page.locator("main")).toContainText("تومان");
  });

  test("an expired venue's guests are told the menu is paused, not missing", async ({
    page,
  }) => {
    await page.goto("/menu/golpar");
    await expect(page.locator("main")).toContainText("موقتاً در دسترس نیست");
    await expect(page.locator("main")).toContainText("شیرینی و قهوه گلپر");
  });
});
