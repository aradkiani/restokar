import { expect, test } from "@playwright/test";
import { PHONES, db, one } from "./support/env";
import { signInWithApi, watchForErrors } from "./support/session";
import { businessDateKey } from "../src/lib/business-day";

/** Latin digits as the Persian interface shows them. */
const localDigits = (value: string) =>
  value.replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]!);

test.describe("staff and branch roles", () => {
  test("a barista works the order board on a phone", async ({ page }) => {
    const errors = watchForErrors(page);
    await signInWithApi(page.request, PHONES.largeCashier);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/orders/);
    const start = page.getByRole("button", { name: "شروع آماده‌سازی" }).first();
    if (await start.count()) {
      await start.click();
      await expect(page.getByRole("button", { name: "آماده شد" }).first()).toBeVisible();
    }
    // The panel streams a loading skeleton first, so the refusal arrives as a
    // redirect inside the response: check where the barista ends up, not the
    // first response's address.
    await page.goto("/dashboard/finance");
    await expect(page).not.toHaveURL(/\/dashboard\/finance/);
    await expect(page.getByText("سود خالص")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("menu-only staff cannot read orders through the API", async ({ page }) => {
    await signInWithApi(page.request, PHONES.largeMenuStaff);
    const response = await page.request.get("/api/orders?scope=all");
    expect(response.status()).toBe(403);
  });

  test("menu-only staff cannot change an order's status", async ({ page }) => {
    await signInWithApi(page.request, PHONES.largeMenuStaff);
    const order = await one<{ id: string }>(
      `SELECT o.id FROM "Order" o JOIN "Restaurant" r ON r.id = o."restaurantId"
        WHERE r.slug = 'dudi-burger' AND o.status = 'DELIVERED' LIMIT 1`,
    );
    const response = await page.request.patch(`/api/orders/${order.id}/status`, {
      data: { status: "DELIVERED" },
    });
    expect(response.status()).toBe(403);
  });

  test("an accountant can open the printable financial report", async ({ page }) => {
    await signInWithApi(page.request, PHONES.largeAccountant);
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

  test("a dish marked sold out at one branch stays on sale at the other", async ({
    page,
    request,
  }) => {
    const dish = await one<{ id: string; name: string }>(
      `SELECT p.id, p.name FROM "Product" p JOIN "Restaurant" r ON r.id = p."restaurantId"
        WHERE r.slug = 'pizza-tanoor' AND p."isAvailable"
          AND NOT EXISTS (SELECT 1 FROM "ProductOptionGroup" g WHERE g."productId" = p.id)
        ORDER BY p.price LIMIT 1`,
    );
    const order = (slug: string) =>
      request.post("/api/public/orders", {
        data: {
          slug,
          tableNumber: "4",
          customerName: "آزمون تمام‌شد",
          items: [{ productId: dish.id, quantity: 1 }],
        },
      });

    await signInWithApi(page.request, PHONES.vanakManager);
    try {
      const marked = await page.request.post("/api/orders/sold-out", {
        data: { productId: dish.id, soldOut: true },
      });
      expect(marked.ok(), await marked.text()).toBeTruthy();

      // Refused at Vanak, worded for the guest with the dish's name…
      const refused = await order("pizza-tanoor-vanak");
      expect(refused.status()).toBe(409);
      const body = await refused.json();
      expect(body.error.code).toBe("ITEM_SOLD_OUT");
      expect(body.error.details.name).toBe(dish.name);

      // …and still sold at Tajrish.
      expect((await order("pizza-tanoor-tajrish")).ok()).toBeTruthy();

      // Back in stock: Vanak sells it again.
      await page.request.post("/api/orders/sold-out", {
        data: { productId: dish.id, soldOut: false },
      });
      expect((await order("pizza-tanoor-vanak")).ok()).toBeTruthy();
    } finally {
      await db.query(`DELETE FROM "SoldOutProduct" WHERE "productId" = $1`, [dish.id]);
    }
  });

  test("the kitchen marks a dish sold out from the board", async ({ page }) => {
    const errors = watchForErrors(page);
    await signInWithApi(page.request, PHONES.largeCashier);
    await page.goto("/dashboard/orders");
    try {
      await page
        .getByRole("button", { name: /^تمام شد/ })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("غذاهای تمام‌شدهٔ امروز")).toBeVisible();
      await dialog.getByRole("button", { name: "تمام شد" }).first().click();
      await expect(dialog.getByRole("button", { name: "موجود شد" })).toHaveCount(1);
      await dialog.getByRole("button", { name: "موجود شد" }).click();
      await expect(dialog.getByRole("button", { name: "موجود شد" })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await db.query(
        `DELETE FROM "SoldOutProduct" WHERE "restaurantId" =
           (SELECT id FROM "Restaurant" WHERE slug = 'dudi-burger')`,
      );
    }
  });

  test("the bill and the kitchen ticket print for staff on the orders board", async ({
    page,
  }) => {
    const order = await one<{ id: string; orderNumber: number }>(
      `SELECT o.id, o."orderNumber" FROM "Order" o JOIN "Restaurant" r ON r.id = o."restaurantId"
        WHERE r.slug = 'dudi-burger' ORDER BY o."placedAt" DESC LIMIT 1`,
    );
    await signInWithApi(page.request, PHONES.largeCashier);
    await page.goto(`/print/order/${order.id}?kind=bill`);
    await expect(page.locator("main")).toContainText("مبلغ قابل پرداخت");
    await page.goto(`/print/order/${order.id}?kind=ticket`);
    await expect(page.locator("main")).toContainText("فیش آشپزخانه");
    await expect(page.locator("main")).not.toContainText("تومان");

    // Without the orders section there is nothing to print.
    await signInWithApi(page.request, PHONES.largeMenuStaff);
    await page.goto(`/print/order/${order.id}?kind=bill`);
    await expect(page.locator("main")).not.toContainText("مبلغ قابل پرداخت");
  });

  test("a table asks for the bill and the cashier settles its rounds at once", async ({
    page,
    request,
  }) => {
    const table = `9${Date.now() % 1000}`;
    const dish = await one<{ id: string; name: string; price: number }>(
      `SELECT p.id, p.name, p.price FROM "Product" p JOIN "Restaurant" r ON r.id = p."restaurantId"
        WHERE r.slug = 'dudi-burger' AND p."isAvailable"
          AND NOT EXISTS (SELECT 1 FROM "ProductOptionGroup" g WHERE g."productId" = p.id)
        ORDER BY p.price LIMIT 1`,
    );
    // Two rounds from the same table, then the guests ask for the bill.
    for (let round = 0; round < 2; round += 1) {
      const placed = await request.post("/api/public/orders", {
        data: {
          slug: "dudi-burger",
          tableNumber: table,
          customerName: "میز آزمایشی",
          items: [{ productId: dish.id, quantity: 1 }],
        },
      });
      expect(placed.ok(), await placed.text()).toBeTruthy();
    }
    const call = await request.post("/api/public/staff-call", {
      data: { slug: "dudi-burger", tableNumber: table, kind: "BILL" },
    });
    expect(call.status()).toBe(201);

    try {
      await signInWithApi(page.request, PHONES.largeCashier);
      await page.goto("/dashboard/orders");
      await expect(
        page.getByText(`میز ${localDigits(table)} — صورتحساب می‌خواهد`),
      ).toBeVisible();

      await page.getByRole("tab", { name: "میزها" }).click();
      const card = page
        .getByRole("region", { name: "میزها" })
        .locator("li", { hasText: `میز ${localDigits(table)}` })
        .first();
      await expect(card).toContainText("صورتحساب می‌خواهد");
      await expect(card).toContainText("۲ سفارش");

      // One bill, the dish merged into a single line of two.
      await page.goto(`/print/table?table=${table}`);
      await expect(page.locator("main")).toContainText(`۲×`);
      await expect(page.locator("main")).toContainText(dish.name);

      await page.goto("/dashboard/orders");
      await page.getByRole("tab", { name: "میزها" }).click();
      await page
        .getByRole("region", { name: "میزها" })
        .locator("li", { hasText: `میز ${localDigits(table)}` })
        .first()
        .getByRole("button", { name: "تسویه نقدی" })
        .click();
      await page.getByRole("dialog").getByRole("button", { name: "تسویه نقدی" }).click();
      await expect(page.getByText(`میز ${localDigits(table)} تسویه شد`)).toBeVisible();

      const unpaid = await one<{ count: string }>(
        `SELECT count(*) FROM "Order" o JOIN "Restaurant" r ON r.id = o."restaurantId"
          WHERE r.slug = 'dudi-burger' AND o."tableNumber" = $1 AND o."paymentStatus" <> 'PAID'`,
        [table],
      );
      expect(Number(unpaid.count)).toBe(0);
    } finally {
      await db.query(`DELETE FROM "StaffCall" WHERE "tableNumber" = $1`, [table]);
    }
  });

  test("the cashier closes the business day's till, opening float included", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await signInWithApi(page.request, PHONES.largeCashier);
    // The burger house runs 12:00–02:00: its "today" is the business day the
    // site's own hours say, which after midnight is still the evening before.
    const site = await one<{ id: string; start: number; end: number }>(
      `SELECT id, "businessDayStart" AS start, "businessDayEnd" AS end
         FROM "Restaurant" WHERE slug = 'dudi-burger'`,
    );
    const today = businessDateKey(new Date(), { start: site.start, end: site.end });
    const opening = 500_000;
    try {
      await page.goto("/dashboard/orders/close");
      await expect(page.getByRole("heading", { name: "بستن صندوق" })).toBeVisible();
      const taken = await one<{ cash: string }>(
        `SELECT COALESCE(SUM(o.total), 0) AS cash FROM "Order" o
          WHERE o."restaurantId" = $1 AND o."businessDate" = $2::date
            AND o."paymentMethod" = 'CASH_ON_SITE' AND o."paymentStatus" = 'PAID'
            AND (o.status <> 'CANCELED' OR o."refundedAt" IS NULL)`,
        [site.id, today],
      );
      const expected = opening + Number(taken.cash);
      // 1,000 Toman short.
      const counted = expected - 1000;
      await page.getByLabel(/موجودی اول روز صندوق/).fill(String(opening));
      await page.getByLabel(/مبلغ شمارش‌شده/).fill(String(counted));
      await expect(page.locator("main")).toContainText("کسری");
      await page.getByRole("button", { name: "ثبت بستن صندوق" }).click();
      await expect(page.getByRole("button", { name: "ثبت دوبارهٔ شمارش" })).toBeVisible();

      const row = await one<{
        countedCash: number;
        expectedCash: number;
        openingCash: number;
      }>(
        `SELECT "countedCash", "expectedCash", "openingCash" FROM "DailyClose"
          WHERE "restaurantId" = $1
            AND ((day AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date = $2::date`,
        [site.id, today],
      );
      expect(row.openingCash).toBe(opening);
      expect(row.countedCash).toBe(counted);
      expect(row.expectedCash).toBe(expected);

      await page.goto("/print/close");
      await expect(page.locator("main")).toContainText("پول نقدی که باید در صندوق باشد");
      expect(errors).toEqual([]);
    } finally {
      // Only the close this journey wrote; the months before it stay.
      await db.query(
        `DELETE FROM "DailyClose" WHERE "restaurantId" = $1
            AND ((day AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date = $2::date`,
        [site.id, today],
      );
    }
  });

  test("a branch cashier works only their branch, and the chain owner manages them", async ({
    page,
  }) => {
    const vanak = await one<{ id: string }>(
      `SELECT id FROM "Restaurant" WHERE slug = 'pizza-tanoor-vanak'`,
    );
    await signInWithApi(page.request, PHONES.vanakCashier);
    const board = await page.request.get("/api/orders?scope=all");
    expect(board.ok(), await board.text()).toBeTruthy();
    const orders = (await board.json()).data as { id: string }[];
    expect(orders.length).toBeGreaterThan(0);
    const foreign = await one<{ count: string }>(
      `SELECT count(*) FROM "Order" WHERE id = ANY($1) AND "restaurantId" <> $2`,
      [orders.map((o) => o.id), vanak.id],
    );
    expect(Number(foreign.count)).toBe(0);
    // The till reads the menu to type in counter orders; it cannot change it.
    const edit = await page.request.post("/api/products", {
      data: { name: "x", price: 1, categoryId: "x" },
    });
    expect(edit.status()).toBe(403);

    // The chain owner sees them on the staff page, at their branch, and cannot
    // hand a branch account the chain's menu.
    await signInWithApi(page.request, PHONES.chainOwner);
    const staff = (await (await page.request.get("/api/staff")).json()).data as {
      id: string;
      phone: string;
      siteId: string;
    }[];
    const cashier = staff.find((row) => row.phone === PHONES.vanakCashier)!;
    expect(cashier.siteId).toBe(vanak.id);
    const widened = await page.request.patch(`/api/staff/${cashier.id}`, {
      data: { tabs: ["orders", "menu"] },
    });
    expect(widened.ok(), await widened.text()).toBeTruthy();
    expect((await widened.json()).data.staffTabs).toEqual(["orders"]);
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
