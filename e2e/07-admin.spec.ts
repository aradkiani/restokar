import { expect, test } from "@playwright/test";
import { PHONES } from "./support/env";
import { signInWithApi, signInWithUi, watchForErrors } from "./support/session";

const ADMIN_PAGES = [
  "/admin",
  "/admin/restaurants",
  "/admin/accounts/new",
  "/admin/revenue",
  "/admin/expiring",
  "/admin/support",
  "/admin/sms",
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
      .getByRole("link", { name: /کافه نارنج/ })
      .first()
      .click();
    await expect(page.locator("main")).toContainText("کافه نارنج");
    expect(errors).toEqual([]);
  });

  test("site content and plans can be managed from the admin panel", async ({ page }) => {
    await signInWithApi(page.request, PHONES.admin);
    for (const path of ["/admin/plans", "/admin/content", "/admin/site"]) {
      expect.soft((await page.goto(path))?.status(), path).toBe(200);
    }
  });

  test("a restaurant owner is kept out of every admin page and API", async ({ page }) => {
    await signInWithApi(page.request, PHONES.narenjOwner);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    for (const path of ["/api/admin/restaurants", "/api/admin/settings"]) {
      expect((await page.request.get(path)).status(), path).toBe(403);
    }
  });
});
