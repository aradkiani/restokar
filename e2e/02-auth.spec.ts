import { expect, test } from "@playwright/test";
import {
  KNOWN_CODE,
  PHONES,
  clearRateLimits,
  db,
  forgetCodes,
  one,
  setKnownCode,
} from "./support/env";
import { signInWithUi, watchForErrors } from "./support/session";

async function askForCode(page: import("@playwright/test").Page, phone: string) {
  await clearRateLimits();
  await forgetCodes(phone);
  await page.goto("/login");
  await page.getByLabel("شمارهٔ موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  await expect(page.getByLabel("کد تأیید")).toBeVisible();
}

test.describe("sign-in with a one-time code", () => {
  test("an invalid number is refused with a Persian message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("شمارهٔ موبایل").fill("12345");
    await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
    await expect(page.getByLabel("کد تأیید")).toHaveCount(0);
    await expect(page.locator("form")).toContainText(/شماره|موبایل/);
  });

  test("an unregistered number looks exactly like a registered one", async ({ page }) => {
    await askForCode(page, "09121110000");
    await expect(page.locator("body")).toContainText(
      "کد فقط برای شماره‌ای فرستاده می‌شود",
    );
  });

  test("a wrong code is refused and the person can try again", async ({ page }) => {
    await askForCode(page, PHONES.narenjOwner);
    await setKnownCode(PHONES.narenjOwner);
    await page.getByLabel("کد تأیید").fill(KNOWN_CODE.split("").reverse().join(""));
    await expect(
      page.getByRole("alert").or(page.locator("[aria-invalid='true']")),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
    await page.waitForURL(/\/dashboard/);
  });

  test("an expired code is refused", async ({ page }) => {
    await askForCode(page, PHONES.narenjOwner);
    await setKnownCode(PHONES.narenjOwner);
    await db.query(
      `UPDATE "OtpChallenge" SET "expiresAt" = now() - interval '1 minute' WHERE phone = $1`,
      [PHONES.narenjOwner],
    );
    await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
    await expect(page.locator("body")).toContainText(/منقضی|گذشته|دوباره/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("five wrong guesses lock the code", async ({ page }) => {
    await askForCode(page, PHONES.narenjOwner);
    await setKnownCode(PHONES.narenjOwner);
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("کد تأیید").fill(`9999${i}`.slice(0, KNOWN_CODE.length));
      await page.waitForTimeout(400);
    }
    await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/login/);
  });

  test("resending is offered after a countdown", async ({ page }) => {
    await askForCode(page, PHONES.narenjOwner);
    await expect(page.locator("body")).toContainText(/ارسال دوباره تا|ارسال دوبارهٔ کد/);
  });

  test("double-tapping «دریافت کد» issues one code", async ({ page }) => {
    await clearRateLimits();
    await forgetCodes(PHONES.narenjOwner);
    await page.goto("/login");
    await page.getByLabel("شمارهٔ موبایل").fill(PHONES.narenjOwner);
    const button = page.getByRole("button", { name: "دریافت کد تأیید" });
    await button.dblclick();
    await expect(page.getByLabel("کد تأیید")).toBeVisible();
    const { count } = await one<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "OtpChallenge" WHERE phone = $1`,
      [PHONES.narenjOwner],
    );
    expect(Number(count)).toBe(1);
  });

  test("signed in survives a reload; signed out cannot go back", async ({ page }) => {
    await signInWithUi(page, PHONES.narenjOwner);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    const openMenu = page.getByRole("button", { name: "باز کردن منو" });
    if (await openMenu.isVisible()) await openMenu.click();
    await page.getByRole("button", { name: "خروج" }).last().click();
    await page.waitForURL(/\/login|\/$/);
    await page.goBack();
    await page.reload();
    await expect(page).not.toHaveURL(/\/dashboard$/);
  });
});

test.describe("new owner signs up alone", () => {
  test("sign-up to a live menu without help", async ({ page }, testInfo) => {
    const errors = watchForErrors(page);
    const suffix = `${Date.now()}`.slice(-7);
    const phone = `0939${suffix}`;
    const slug = `e2e-cafe-${testInfo.project.name}-${suffix}`;
    await clearRateLimits();

    try {
      await page.goto("/register");
      await page.getByLabel("نام و نام خانوادگی").fill("زهرا تست");
      await page.getByLabel("شمارهٔ موبایل").fill(phone);
      await page.getByLabel("نام رستوران یا کافه").fill("کافه آزمایشی");
      await page.getByLabel("آدرس منو").fill(slug);
      await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
      await expect(page.getByLabel("کد تأیید")).toBeVisible();
      await setKnownCode(phone, "SIGNUP");
      await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
      await page.waitForURL(/\/dashboard/);

      // A brand-new owner should be told what to do first.
      await expect(page.locator("main")).toContainText(/شروع|اولین|منو/);
      const menu = await page.request.get(`/menu/${slug}`);
      expect(menu.status()).toBe(200);
      expect(errors).toEqual([]);
    } finally {
      // Whatever happened above, leave no test venue behind. The owner is a
      // member of the venue, so the account goes with it.
      await db.query(
        `DELETE FROM "Restaurant" WHERE "ownerId" IN (SELECT id FROM "User" WHERE phone = $1)`,
        [phone],
      );
      await db.query(`DELETE FROM "User" WHERE phone = $1`, [phone]);
    }
  });

  test("a taken menu address is explained before any code is sent", async ({ page }) => {
    await clearRateLimits();
    await page.goto("/register");
    await page.getByLabel("نام و نام خانوادگی").fill("زهرا تست");
    await page.getByLabel("شمارهٔ موبایل").fill("09391234567");
    await page.getByLabel("نام رستوران یا کافه").fill("کافه آزمایشی");
    await page.getByLabel("آدرس منو").fill("cafe-narenj");
    await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
    await expect(page.locator("body")).toContainText("این آدرس قبلاً انتخاب شده است");
  });
});
