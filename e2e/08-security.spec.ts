import { expect, test } from "@playwright/test";
import { PHONES, clearRateLimits, db, forgetCodes, one } from "./support/env";
import { signInWithApi } from "./support/session";

/**
 * The attacker's view: API calls a browser would never make on its own.
 * Desktop project only — the phone project would repeat identical requests.
 */
test.describe("attacker mindset", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "API-level, one device is enough");
  });

  test("another venue's records cannot be read or changed by id", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    const theirs = await one<{
      order: string;
      product: string;
      category: string;
      customer: string;
    }>(
      `SELECT
         (SELECT o.id FROM "Order" o WHERE o."restaurantId" = r.id LIMIT 1) AS "order",
         (SELECT p.id FROM "Product" p WHERE p."restaurantId" = r.id LIMIT 1) AS product,
         (SELECT c.id FROM "Category" c WHERE c."restaurantId" = r.id LIMIT 1) AS category,
         (SELECT c.id FROM "Customer" c WHERE c."restaurantId" = r.id LIMIT 1) AS customer
       FROM "Restaurant" r WHERE r.slug = 'dizi-sara'`,
    );
    const attempts = [
      page.request.get(`/api/orders/${theirs.order}`),
      page.request.patch(`/api/orders/${theirs.order}/status`, {
        data: { status: "CANCELED" },
      }),
      page.request.patch(`/api/products/${theirs.product}`, { data: { price: 1 } }),
      page.request.delete(`/api/categories/${theirs.category}`),
      page.request.get(`/api/customers/${theirs.customer}`),
    ];
    for (const response of await Promise.all(attempts)) {
      expect.soft(response.status(), response.url()).toBeGreaterThanOrEqual(400);
    }
    const untouched = await one<{ status: string }>(
      `SELECT status FROM "Order" WHERE id = $1`,
      [theirs.order],
    );
    expect(untouched.status).not.toBe("CANCELED");
  });

  test("the subscription amount cannot be set by the client", async ({ page }) => {
    await signInWithApi(page.request, PHONES.diziOwner);
    const response = await page.request.post("/api/subscription/checkout", {
      data: { planCode: "tier-small", interval: "monthly", amount: 1000 },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const payment = await one<{ amount: number; price: number }>(
      `SELECT pay.amount, pl."monthlyPrice" AS price FROM "Payment" pay
         JOIN "Subscription" s ON s.id = pay."subscriptionId" JOIN "Plan" pl ON pl.code = 'tier-small'
         JOIN "Restaurant" r ON r.id = s."restaurantId"
        WHERE r.slug = 'dizi-sara' ORDER BY pay."createdAt" DESC LIMIT 1`,
    );
    await db.query(
      `UPDATE "Subscription" SET "planId" = (SELECT id FROM "Plan" WHERE code = 'tier-medium'), interval = 'yearly'
        WHERE "restaurantId" = (SELECT id FROM "Restaurant" WHERE slug = 'dizi-sara')`,
    );
    expect(payment.amount).toBe(payment.price);
  });

  test("script in a dish name is shown as text, never run", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    const evil = `<img src=x onerror="window.__xss=1">کیک`;
    const category = await one<{ id: string }>(
      `SELECT c.id FROM "Category" c JOIN "Restaurant" r ON r.id = c."restaurantId"
        WHERE r.slug = 'cafe-narenj' LIMIT 1`,
    );
    await db.query(`DELETE FROM "Product" WHERE name = $1`, [evil]);
    const created = await page.request.post("/api/products", {
      data: { name: evil, price: 50_000, categoryId: category.id },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    await page.goto("/menu/cafe-narenj");
    await expect(page.getByText(evil).first()).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    await db.query(`DELETE FROM "Product" WHERE name = $1`, [evil]);
  });

  test("a non-image upload is refused", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    const response = await page.request.post("/api/upload", {
      multipart: {
        file: {
          name: "photo.png",
          mimeType: "image/png",
          buffer: Buffer.from("not an image"),
        },
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("asking for codes again and again is slowed down", async ({ request }) => {
    await clearRateLimits();
    await forgetCodes("09121112233");
    const first = await request.post("/api/auth/otp", {
      data: { phone: "09121112233", purpose: "LOGIN" },
    });
    const second = await request.post("/api/auth/otp", {
      data: { phone: "09121112233", purpose: "LOGIN" },
    });
    expect(first.ok()).toBeTruthy();
    expect(second.status()).toBe(429);
  });

  test("a write from another website is refused", async ({ request }) => {
    const response = await request.post("/api/auth/otp", {
      headers: { Origin: "https://evil.example" },
      data: { phone: "09121112233", purpose: "LOGIN" },
    });
    expect(response.status()).toBe(403);
  });

  test("the session cookie is not readable by scripts", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "restokar_session");
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
  });

  test("protective headers are sent", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors");
  });
});
