import { expect, test } from "@playwright/test";
import { clearRateLimits, one } from "./support/env";
import { watchForErrors } from "./support/session";

/** A slow mobile connection: ~400 kbps down, 300 ms round trip. */
async function slowNetwork(page: import("@playwright/test").Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

test.describe("diner at the table", () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("opens the menu on a slow phone connection in reasonable time", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-only measurement");
    await slowNetwork(page);
    const started = Date.now();
    await page.goto("/menu/cafe-narenj?table=3", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("اسپرسو").first()).toBeVisible({ timeout: 30_000 });
    const firstContent = Date.now() - started;
    await page.waitForLoadState("load", { timeout: 60_000 });
    const fullyLoaded = Date.now() - started;
    testInfo.annotations.push({
      type: "timing",
      description: `slow 4G-ish: menu text ${firstContent} ms, fully loaded ${fullyLoaded} ms`,
    });
    expect(firstContent).toBeLessThan(8_000);
  });

  test("orders a latte with a required size, then follows it", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/menu/cafe-narenj?table=3");
    await page.getByText("لاته", { exact: true }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByText("بزرگ", { exact: true }).click();
    await sheet
      .getByRole("button", { name: /^افزودن/ })
      .last()
      .click();
    // Adding opens the cart with suggestions; checkout continues from there.
    const cart = page.getByRole("dialog");
    await cart.getByRole("button", { name: "ثبت سفارش" }).click();
    await cart.getByLabel("نام شما").fill("مهمان آزمایشی");
    await cart.getByRole("button", { name: "ثبت نهایی سفارش" }).click();
    await page.waitForURL(/\/order\//);
    await expect(page.locator("body")).toContainText(/ثبت شد|دریافت/);
    expect(errors).toEqual([]);
  });

  test("the price a guest pays comes from the menu, not the request", async ({
    request,
  }) => {
    const latte = await one<{ id: string; price: number }>(
      `SELECT p.id, p.price FROM "Product" p JOIN "Restaurant" r ON r.id = p."restaurantId"
        WHERE r.slug = 'cafe-narenj' AND p."isAvailable"
          AND NOT EXISTS (SELECT 1 FROM "ProductOptionGroup" g WHERE g."productId" = p.id)
        ORDER BY p.price LIMIT 1`,
    );
    const response = await request.post("/api/public/orders", {
      data: {
        slug: "cafe-narenj",
        tableNumber: "2",
        customerName: "آزمون قیمت",
        items: [{ productId: latte.id, quantity: 1, price: 1, total: 1 }],
        total: 1,
        subtotal: 1,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = await response.json();
    const order = await one<{ subtotal: number }>(
      `SELECT subtotal FROM "Order" WHERE "publicToken" = $1`,
      [body.data.publicToken ?? body.data.token],
    );
    expect(order.subtotal).toBe(latte.price);
  });

  test("an unavailable dish cannot be ordered", async ({ request }) => {
    const soldOut = await one<{ id: string }>(
      `SELECT p.id FROM "Product" p JOIN "Restaurant" r ON r.id = p."restaurantId"
        WHERE r.slug = 'cafe-narenj' AND p."isAvailable" = false LIMIT 1`,
    );
    const response = await request.post("/api/public/orders", {
      data: {
        slug: "cafe-narenj",
        tableNumber: "2",
        customerName: "مهمان",
        items: [{ productId: soldOut.id, quantity: 1 }],
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(await response.text()).toMatch(/[؀-ۿ]/);
  });

  test("pays online through the test gateway, success and failure", async ({ page }) => {
    for (const outcome of ["OK", "NOK"] as const) {
      await page.goto("/menu/fastfood-tond?table=5");
      await page.getByText("نوشابه", { exact: true }).first().click();
      const sheet = page.getByRole("dialog");
      await sheet
        .getByRole("button", { name: /^افزودن/ })
        .last()
        .click();
      const cart = page.getByRole("dialog");
      await cart.getByRole("button", { name: "ثبت سفارش" }).click();
      await cart.getByLabel("نام شما").fill(`پرداخت ${outcome}`);
      await cart.getByText("پرداخت آنلاین").click();
      await cart.getByRole("button", { name: "ثبت نهایی سفارش" }).click();
      await page.waitForURL(/\/payment\/mock/);
      await page.locator(`a[href*="Status=${outcome}"]`).click();
      await page.waitForURL(/\/order\//);
      const token = new URL(page.url()).pathname.split("/").pop()!;
      const order = await one<{ status: string; paymentStatus: string }>(
        `SELECT status, "paymentStatus" FROM "Order" WHERE "publicToken" = $1`,
        [token],
      );
      test.info().annotations.push({
        type: "observation",
        description: `online ${outcome}: order ${order.status}, payment ${order.paymentStatus}`,
      });
      if (outcome === "OK") expect(order.paymentStatus).toBe("PAID");
      else expect(order.status).toBe("CANCELED");
    }
  });

  test("every template renders a menu that fits the screen", async ({ page }) => {
    const errors = watchForErrors(page);
    const templates = [
      "atlas",
      "aurora",
      "bazaar",
      "bloom",
      "ember",
      "kashi",
      "linen",
      "noir",
      "qalam",
      "reel",
      "vitrin",
    ];
    for (const id of templates) {
      await page.goto(`/menu/demo-${id}`);
      await expect.soft(page.locator("body"), id).toContainText("تومان");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect.soft(overflow, `${id} scrolls sideways`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
});
