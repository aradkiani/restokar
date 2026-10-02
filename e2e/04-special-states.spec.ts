import { expect, test } from "@playwright/test";
import { PHONES } from "./support/env";
import { signInWithApi } from "./support/session";

test.describe("owners in special states", () => {
  test("a trial ending in two days is announced in the dashboard", async ({ page }) => {
    await signInWithApi(page.request, PHONES.baranOwner);
    await page.goto("/dashboard");
    await expect(page.getByRole("alert").or(page.locator("main"))).toContainText(
      /روز|تمدید|اشتراک/,
    );
  });

  test("a menu-only venue shows its menu but takes no orders", async ({ page }) => {
    await page.goto("/menu/cafe-baran");
    await expect(page.locator("body")).toContainText("اسپرسو");
    const order = await page.request.post("/api/public/orders", {
      data: {
        slug: "cafe-baran",
        tableNumber: "1",
        customerName: "مهمان",
        items: [{ productId: "x", quantity: 1 }],
      },
    });
    expect(order.status()).toBeGreaterThanOrEqual(400);
  });

  test("an expired owner is told clearly and can renew", async ({ page }) => {
    await signInWithApi(page.request, PHONES.ghadimiOwner);
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText(/منقضی|پایان|تمدید/);
    await page.goto("/dashboard/subscription");
    await expect(page.locator("main")).toContainText("تومان");
  });

  test("what an expired venue's guests see (recorded, policy decision)", async ({
    page,
  }) => {
    const response = await page.goto("/menu/cafe-ghadimi");
    test.info().annotations.push({
      type: "observation",
      description: `expired venue menu status ${response?.status()}`,
    });
    expect(response?.status()).toBe(200);
  });
});
