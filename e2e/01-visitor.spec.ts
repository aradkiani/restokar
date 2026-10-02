import { expect, test, type Page } from "@playwright/test";
import { watchForErrors } from "./support/session";

/** A phone screen must never scroll sideways. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}

test.describe("first-time visitor", () => {
  test("homepage explains the product, shows prices and a way to start", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("#pricing")).toContainText("تومان");
    await expect(page.locator("#faq")).toBeVisible();
    await expectNoSidewaysScroll(page);
    expect(errors).toEqual([]);
  });

  test("SEO basics are present on the homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/رستوکار/);
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description?.length ?? 0).toBeGreaterThan(50);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });

  test("site files every search engine and browser asks for exist", async ({
    request,
  }) => {
    for (const path of ["/robots.txt", "/sitemap.xml", "/favicon.ico"]) {
      const response = await request.get(path);
      expect.soft(response.status(), path).toBe(200);
    }
  });

  test("every link on the homepage leads somewhere", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page
      .locator("a[href^='/']")
      .evaluateAll((links) => [
        ...new Set(links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)),
      ]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      const response = await request.get(href.split("#")[0] || "/", { maxRedirects: 0 });
      expect.soft(response.status(), href).toBeLessThan(400);
    }
  });

  test("every demo template opens", async ({ page, request }) => {
    await page.goto("/");
    const demos = await page
      .locator("#demo a[href^='/menu/']")
      .evaluateAll((links) =>
        links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!),
      );
    expect(demos.length).toBe(11);
    for (const href of demos) {
      expect.soft((await request.get(href)).status(), href).toBe(200);
    }
  });

  test("pricing page lists plans with prices", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main")).toContainText("تومان");
    await expectNoSidewaysScroll(page);
    expect(errors).toEqual([]);
  });

  test("contact details are real, not placeholders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#contact")).not.toContainText("021-00000000");
  });

  test("trust and legal pages exist", async ({ request }) => {
    for (const path of ["/terms", "/privacy", "/about", "/contact", "/refund-policy"]) {
      expect.soft((await request.get(path)).status(), path).toBe(200);
    }
  });

  test("an unknown address shows a Persian 404 with a way back", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).toContainText(/یافت نشد|پیدا نشد|وجود ندارد/);
    await expect(page.locator("a[href='/']").first()).toBeVisible();
  });

  test("an unknown menu shows the menu 404", async ({ page }) => {
    const response = await page.goto("/menu/no-such-cafe");
    expect(response?.status()).toBe(404);
  });
});
