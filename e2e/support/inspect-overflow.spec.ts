import { test } from "@playwright/test";
import { PHONES } from "./env";
import { signInWithApi } from "./session";

/**
 * Diagnostic, not a journey: prints the elements that stick out past the right
 * or left edge of a page. Run with
 *   npx playwright test e2e/support/inspect-overflow.spec.ts --project=mobile
 * and OVERFLOW_PATH=/dashboard/design (default).
 */
test("list elements wider than the screen", async ({ page }, testInfo) => {
  test.skip(!process.env.OVERFLOW_PATH, "diagnostic; set OVERFLOW_PATH to run");
  await signInWithApi(page.request, PHONES.smallOwner);
  // Without a leading slash: Git Bash rewrites "/dashboard" into a Windows path.
  await page.goto(`/${process.env.OVERFLOW_PATH!.replace(/^\/+/, "")}`);
  const offenders = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // Elements wider than the screen, or whose content is, deepest first: the
    // first entries are the cause, the rest are the ancestors it stretched.
    return [...document.querySelectorAll("main *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > width + 1 || el.scrollWidth > width + 1)
      .reverse()
      .slice(0, 12)
      .map(({ el, r }) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") ?? "").slice(0, 110),
        text: (el.textContent ?? "").trim().slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
      }));
  });
  testInfo.annotations.push({ type: "overflow", description: JSON.stringify(offenders) });
  console.warn(JSON.stringify(offenders, null, 1));
});
