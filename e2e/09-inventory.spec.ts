import { expect, test } from "@playwright/test";
import { PHONES, clearRateLimits, db, one } from "./support/env";
import { signInWithApi, watchForErrors } from "./support/session";

/** What one site holds of a named item of its chain's catalogue. */
async function level(siteSlug: string, itemName: string): Promise<number> {
  const row = await one<{ q: number | null }>(
    `SELECT l."quantityMilli" AS q
       FROM "StockLevel" l
       JOIN "InventoryItem" i ON i.id = l."itemId"
       JOIN "Restaurant" r ON r.id = l."restaurantId"
      WHERE r.slug = $1 AND i.name = $2`,
    [siteSlug, itemName],
  );
  return Number(row.q ?? 0);
}

/** The ledger must always add up to the shelf. */
async function ledgerMismatches(): Promise<number> {
  const row = await one<{ n: string }>(
    `SELECT count(*) AS n FROM "StockLevel" l
      WHERE l."quantityMilli" <> (
        SELECT COALESCE(SUM("deltaMilli"), 0) FROM "StockMovement" m
         WHERE m."itemId" = l."itemId" AND m."restaurantId" = l."restaurantId")`,
  );
  return Number(row.n);
}

test.describe("inventory", () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("an owner books a purchase and the shelf and average cost follow", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await signInWithApi(page.request, PHONES.narenjOwner);
    const before = await level("cafe-narenj", "شیر");

    await page.goto("/dashboard/inventory?view=purchases");
    const form = page.getByRole("form", { name: "ثبت خرید جدید" });
    await form.getByLabel("ماده").selectOption({ label: "شیر" });
    await form.getByLabel("مقدار").fill("۱۰");
    await form.getByLabel("مبلغ کل ردیف").fill("۴۵۰۰۰۰");
    await form.getByRole("button", { name: "ثبت خرید جدید" }).click();
    await expect(page.getByText("خرید ثبت شد")).toBeVisible();

    expect(await level("cafe-narenj", "شیر")).toBe(before + 10_000);
    const movement = await one<{ unitCost: number }>(
      `SELECT m."unitCost" FROM "StockMovement" m JOIN "InventoryItem" i ON i.id = m."itemId"
        WHERE i.name = 'شیر' AND m.reason = 'PURCHASE' ORDER BY m."createdAt" DESC LIMIT 1`,
    );
    expect(movement.unitCost).toBe(45_000);
    expect(await ledgerMismatches()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("waste comes off the shelf and shows on the profit and loss", async ({ page }) => {
    const errors = watchForErrors(page);
    await signInWithApi(page.request, PHONES.narenjOwner);
    const before = await level("cafe-narenj", "دانه قهوه");

    await page.goto("/dashboard/inventory?view=waste");
    const form = page.getByRole("form", { name: "ثبت ضایعات" });
    await form.getByLabel("ماده").selectOption({ label: "دانه قهوه" });
    await form.getByLabel("مقدار").fill("۰٫۲");
    await form.getByLabel("علت").selectOption("expired");
    await form.getByRole("button", { name: "ثبت ضایعات" }).click();
    await expect(page.getByText("ضایعات ثبت شد")).toBeVisible();

    expect(await level("cafe-narenj", "دانه قهوه")).toBe(before - 200);
    await page.goto("/dashboard/finance");
    await expect(page.getByText("ضایعات انبار")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a count sets the shelf to what was counted", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    page.on("dialog", (dialog) => dialog.accept());
    const before = await level("cafe-narenj", "شکلات تلخ");

    await page.goto("/dashboard/inventory?view=count");
    await page.getByLabel("شکلات تلخ").fill("۱٫۲۵");
    await expect(page.getByText(/۱ قلم شمرده شد/)).toBeVisible();
    await page.getByRole("button", { name: "ثبت انبارگردانی" }).click();
    await expect(page.getByText("انبارگردانی ثبت شد")).toBeVisible();

    expect(await level("cafe-narenj", "شکلات تلخ")).toBe(1_250);
    expect(await ledgerMismatches()).toBe(0);

    // Counted back to where it was: the owner journey checks this item is low.
    const item = await one<{ id: string }>(
      `SELECT i.id FROM "InventoryItem" i JOIN "Restaurant" r ON r.id = i."restaurantId"
        WHERE r.slug = 'cafe-narenj' AND i.name = 'شکلات تلخ'`,
    );
    const restored = await page.request.post("/api/inventory/stocktakes", {
      data: { lines: [{ itemId: item.id, counted: before / 1000 }] },
    });
    expect(restored.ok(), await restored.text()).toBeTruthy();
  });

  test("a branch keeps its own shelves and cannot reach another's", async ({
    page,
    request,
  }) => {
    // A branch's order comes out of that branch's stock, not the chain's.
    const dish = await one<{ id: string; itemName: string }>(
      `SELECT p.id, i.name AS "itemName" FROM "Product" p
         JOIN "ProductIngredient" pi ON pi."productId" = p.id
         JOIN "InventoryItem" i ON i.id = pi."itemId"
         JOIN "Restaurant" r ON r.id = p."restaurantId"
        WHERE r.slug = 'pizza-noon' AND p."isAvailable"
          AND NOT EXISTS (SELECT 1 FROM "ProductOptionGroup" g
                           WHERE g."productId" = p.id AND g."isRequired")
        LIMIT 1`,
    );
    const vanakBefore = await level("pizza-noon-vanak", dish.itemName);
    const ownerBefore = await level("pizza-noon", dish.itemName);
    const ordered = await request.post("/api/public/orders", {
      data: {
        slug: "pizza-noon-vanak",
        tableNumber: "2",
        customerName: "آزمون انبار",
        items: [{ productId: dish.id, quantity: 1 }],
      },
    });
    expect(ordered.ok(), await ordered.text()).toBeTruthy();
    expect(await level("pizza-noon-vanak", dish.itemName)).toBeLessThan(vanakBefore);
    expect(await level("pizza-noon", dish.itemName)).toBe(ownerBefore);

    // The manager may name another branch; the waste still lands on their own.
    await signInWithApi(page.request, PHONES.vanakManager);
    const tajrish = await one<{ id: string }>(
      `SELECT id FROM "Restaurant" WHERE slug = 'pizza-noon-tajrish'`,
    );
    const item = await one<{ id: string }>(
      `SELECT i.id FROM "InventoryItem" i JOIN "Restaurant" r ON r.id = i."restaurantId"
        WHERE r.slug = 'pizza-noon' AND i.name = $1`,
      [dish.itemName],
    );
    const tajrishBefore = await level("pizza-noon-tajrish", dish.itemName);
    const vanakMid = await level("pizza-noon-vanak", dish.itemName);
    const waste = await page.request.post("/api/inventory/waste", {
      data: { siteId: tajrish.id, itemId: item.id, amount: 1, reason: "damaged" },
    });
    expect(waste.ok(), await waste.text()).toBeTruthy();
    expect(await level("pizza-noon-tajrish", dish.itemName)).toBe(tajrishBefore);
    expect(await level("pizza-noon-vanak", dish.itemName)).toBeLessThan(vanakMid);

    // And sees no site switcher — only a chain owner chooses.
    await page.goto("/dashboard/inventory");
    await expect(page.getByRole("navigation", { name: "شعبه" })).toHaveCount(0);
    expect(await ledgerMismatches()).toBe(0);
  });

  test("staff without the inventory grant are refused", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjBarista);
    const item = await one<{ id: string }>(
      `SELECT i.id FROM "InventoryItem" i JOIN "Restaurant" r ON r.id = i."restaurantId"
        WHERE r.slug = 'cafe-narenj' LIMIT 1`,
    );
    const response = await page.request.post("/api/inventory/waste", {
      data: { itemId: item.id, amount: 1, reason: "other" },
    });
    expect(response.status()).toBe(403);
  });

  test("removing an ingredient with history archives it and keeps the ledger", async ({
    page,
  }, testInfo) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    const name = `زعفران آزمایشی ${testInfo.project.name}`;
    await db.query(
      `DELETE FROM "StockMovement" WHERE "itemId" IN (SELECT id FROM "InventoryItem" WHERE name = $1)`,
      [name],
    );
    await db.query(`DELETE FROM "InventoryItem" WHERE name = $1`, [name]);

    const created = await page.request.post("/api/inventory", {
      data: {
        name,
        unit: "g",
        quantity: 50,
        lowStock: 0,
        purchasePrice: 300_000,
        priceUnit: "g",
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { data } = await created.json();
    expect(data.quantityMilli).toBe(50_000);

    const removed = await page.request.delete(`/api/inventory/${data.id}`);
    expect((await removed.json()).data.archived).toBe(true);
    const row = await one<{ isActive: boolean; movements: string }>(
      `SELECT i."isActive", (SELECT count(*) FROM "StockMovement" m WHERE m."itemId" = i.id) AS movements
         FROM "InventoryItem" i WHERE i.id = $1`,
      [data.id],
    );
    expect(row.isActive).toBe(false);
    expect(Number(row.movements)).toBe(1);
  });
});
