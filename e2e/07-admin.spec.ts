import { expect, test } from "@playwright/test";
import { PHONES, db } from "./support/env";
import { signInWithApi, signInWithUi, watchForErrors } from "./support/session";

const ADMIN_PAGES = [
  "/admin",
  "/admin/restaurants",
  "/admin/accounts/new",
  "/admin/revenue",
  "/admin/expiring",
  "/admin/support",
  "/admin/sms",
  "/admin/plans",
  "/admin/site",
  "/admin/content",
  "/admin/content/page-terms",
  "/admin/audit",
  "/admin/errors",
  "/admin/settings",
];

test.describe("platform admin", () => {
  test("every admin page opens without errors", async ({ page }) => {
    const errors = watchForErrors(page);
    await signInWithUi(page, PHONES.admin);
    for (const path of ADMIN_PAGES) {
      const response = await page.goto(path);
      expect.soft(response?.status(), path).toBe(200);
    }
    await page.goto("/admin/restaurants");
    await page
      .getByRole("link", { name: /کافه نیمکت/ })
      .first()
      .click();
    await expect(page.locator("main")).toContainText("کافه نیمکت");
    expect(errors).toEqual([]);
  });

  test("a page edit stays a draft until published, then goes live at once", async ({
    page,
    request,
  }) => {
    const KEY = "page-about";
    const TITLE = "دربارهٔ ما — نسخهٔ آزمایشی";
    await signInWithApi(page.request, PHONES.admin);

    const before = (await (await page.request.get(`/api/admin/content/${KEY}`)).json())
      .data as { values: Record<string, unknown>; version: number };

    try {
      await page.goto(`/admin/content/${KEY}`);
      await page.getByLabel("عنوان", { exact: true }).fill(TITLE);
      await page.getByRole("button", { name: "ذخیرهٔ پیش‌نویس" }).click();
      await expect(page.getByText("پیش‌نویس منتشرنشده")).toBeVisible();

      // Saved, not published: visitors still see the old page.
      expect(await (await request.get("/about")).text()).not.toContain(TITLE);

      // The admin's preview shows the draft, clearly marked.
      await page.goto("/api/admin/preview?path=/about");
      await expect(page.locator("h1")).toHaveText(TITLE);
      await expect(page.getByText("پیش‌نمایش پیش‌نویس")).toBeVisible();
      await page.goto("/api/admin/preview?exit=1");
      await expect(page).toHaveURL(/\/admin\/content/);

      // Publish: live for everyone on the next request.
      await page.goto(`/admin/content/${KEY}`);
      await page.getByRole("button", { name: "انتشار" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "انتشار" }).click();
      await expect(page.getByText(/نسخهٔ منتشرشده/)).toBeVisible();
      await expect
        .poll(async () => (await request.get("/about")).text())
        .toContain(TITLE);

      // And it is in the change log.
      await page.goto("/admin/audit?type=content");
      await expect(page.locator("main")).toContainText("«درباره ما» منتشر شد");
    } finally {
      // Put the page back exactly as it was: republish the old values (which
      // also clears the public cache), then drop the versions this test made.
      await page.request.put(`/api/admin/content/${KEY}`, {
        data: { values: before.values },
      });
      await page.request.post(`/api/admin/content/${KEY}/publish`);
      if (before.version === 0) {
        await db.query(`DELETE FROM "ContentDocument" WHERE key = $1`, [KEY]);
      } else {
        await db.query(
          `DELETE FROM "ContentVersion" WHERE "documentKey" = $1 AND version > $2`,
          [KEY, before.version],
        );
        await db.query(`UPDATE "ContentDocument" SET version = $2 WHERE key = $1`, [
          KEY,
          before.version,
        ]);
      }
      // Prisma stores UTC without a zone; compare in UTC, not the session's zone.
      await db.query(
        `DELETE FROM "AuditLog" WHERE "entityType" = 'ContentDocument' AND "entityId" = $1
           AND "createdAt" > (now() AT TIME ZONE 'UTC') - interval '10 minutes'`,
        [KEY],
      );
    }
    expect(await (await request.get("/about")).text()).not.toContain(TITLE);
  });

  test("unsafe links are refused before they reach a page", async ({ page }) => {
    await signInWithApi(page.request, PHONES.admin);
    const response = await page.request.put("/api/admin/content/page-terms", {
      data: { values: { body: { fa: "[کلیک](javascript:alert(1))", en: "" } } },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.details["body.fa"]).toBeTruthy();
  });

  test("a plan price change is shown old → new before anything is saved", async ({
    page,
  }) => {
    await signInWithApi(page.request, PHONES.admin);
    await page.goto("/admin/plans");
    await page.getByRole("link", { name: /کوچک/ }).first().click();
    await expect(page.locator("h1")).toContainText("کوچک");

    const monthly = page.getByLabel("ماهانه", { exact: true });
    await monthly.fill("649000");
    await page.getByRole("button", { name: "ذخیره", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("قیمت ماهانه");
    await expect(dialog).toContainText("۶۴۹٬۰۰۰");
    await expect(dialog).toContainText("مشترکان فعلی");
    // Cancelled: nothing is written.
    await dialog.getByRole("button", { name: "انصراف" }).click();
  });

  test("the plan API re-checks everything and refuses a stale form", async ({ page }) => {
    await signInWithApi(page.request, PHONES.admin);
    const plan = (
      await db.query(
        `SELECT id, version, "monthlyPrice", "yearlyPrice" FROM "Plan" WHERE code = 'tier-small'`,
      )
    ).rows[0] as {
      id: string;
      version: number;
      monthlyPrice: number;
      yearlyPrice: number;
    };

    const valid = {
      name: "کوچک",
      nameEn: "Small",
      description: null,
      descriptionEn: null,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      promoMonthlyPrice: null,
      promoYearlyPrice: null,
      promoStartsAt: null,
      promoEndsAt: null,
      maxProducts: -1,
      maxCategories: -1,
      maxTables: 10,
      maxDailyViews: 300,
      allowsOnlinePay: false,
      allowsAnalytics: true,
      allowsBranches: false,
      allowsCustomDomain: false,
      isPublic: true,
      isRecommended: false,
      sortOrder: 0,
      features: null,
    };

    // A "promotion" above the regular price.
    const invalid = await page.request.patch(`/api/admin/plans/${plan.id}`, {
      data: {
        ...valid,
        promoMonthlyPrice: plan.monthlyPrice + 1,
        expectedVersion: plan.version,
      },
    });
    expect(invalid.status()).toBe(422);

    // Someone else saved in between.
    const stale = await page.request.patch(`/api/admin/plans/${plan.id}`, {
      data: { ...valid, expectedVersion: plan.version + 1 },
    });
    expect(stale.status()).toBe(409);
  });

  test("a restaurant owner is kept out of every admin page and API", async ({ page }) => {
    await signInWithApi(page.request, PHONES.smallOwner);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    for (const path of [
      "/api/admin/restaurants",
      "/api/admin/settings",
      "/api/admin/content/site",
    ]) {
      expect((await page.request.get(path)).status(), path).toBe(403);
    }
    expect(
      (await page.request.patch("/api/admin/plans/anything", { data: {} })).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch("/api/admin/errors/anything", {
          data: { resolved: true },
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.post("/api/admin/content/site/publish")).status()).toBe(
      403,
    );

    // The preview switch does nothing for anyone but the admin.
    const preview = await page.request.get("/api/admin/preview?path=/about", {
      maxRedirects: 0,
    });
    expect(preview.status()).toBe(403);
  });

  test("a browser error reaches the admin's log, grouped and with personal data removed", async ({
    page,
    request,
  }, testInfo) => {
    // Letters only: long digit runs are blanked by the log, by design.
    const marker = `e2e-${testInfo.project.name}-${Math.random()
      .toString(36)
      .replace(/[^a-z]/g, "")}`;
    await db.query(`DELETE FROM "ErrorEvent" WHERE message LIKE 'TypeError: e2e-%'`);
    for (const token of ["Xk3pQ9vLm2Rt7Yw1zAbc", "Yk3pQ9vLm2Rt7Yw1zAbc"]) {
      const sent = await request.post("/api/client-errors", {
        data: {
          message: `TypeError: ${marker} for 09121234567`,
          path: `/menu/cafe-nimkat/order/${token}?secret=1`,
        },
      });
      expect(sent.ok()).toBeTruthy();
    }

    await signInWithApi(page.request, PHONES.admin);
    await page.goto("/admin/errors");
    const entry = page.getByRole("listitem").filter({ hasText: marker });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText("۲ بار");
    await expect(entry).toContainText("/menu/cafe-nimkat/order/:id");
    await expect(entry).not.toContainText("09121234567");
    await expect(entry).not.toContainText("secret");

    await entry.getByRole("button", { name: "رفع شد" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: marker })).toHaveCount(0);
  });
});
