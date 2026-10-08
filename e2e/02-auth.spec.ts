import { expect, test } from "@playwright/test";
import {
  DEMO_PASSWORD,
  KNOWN_CODE,
  PHONES,
  SLUGS,
  clearRateLimits,
  db,
  forgetCodes,
  one,
  setKnownCode,
} from "./support/env";
import { signInWithApi, signInWithUi, watchForErrors } from "./support/session";

async function typeLogin(
  page: import("@playwright/test").Page,
  phone: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("شمارهٔ موبایل").fill(phone);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
}

test.describe("sign-in with phone and password", () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("an invalid number is refused with a Persian message", async ({ page }) => {
    await typeLogin(page, "12345", DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("form")).toContainText(/شماره|موبایل/);
  });

  test("a wrong password is refused, the right one signs in, and no code is sent", async ({
    page,
  }) => {
    await forgetCodes(PHONES.smallOwner);
    await typeLogin(page, PHONES.smallOwner, "wrong-pass-1");
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "شماره موبایل یا رمز عبور درست نیست",
    );
    await expect(page).toHaveURL(/\/login/);

    await page.locator("#password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "ورود", exact: true }).click();
    await page.waitForURL(/\/dashboard/);

    // Signing in never texts anything.
    const { count } = await one<{ count: string }>(
      `SELECT count(*) FROM "OtpChallenge" WHERE phone = $1`,
      [PHONES.smallOwner],
    );
    expect(Number(count)).toBe(0);
  });

  test("an unknown number and a wrong password get the same answer", async ({
    request,
  }) => {
    const unknown = await request.post("/api/auth/login", {
      data: { phone: "09121110000", password: DEMO_PASSWORD },
    });
    const wrong = await request.post("/api/auth/login", {
      data: { phone: PHONES.mediumOwner, password: "not-it-123" },
    });
    expect(unknown.status()).toBe(401);
    expect(wrong.status()).toBe(401);
    expect((await unknown.json()).error.code).toBe((await wrong.json()).error.code);
  });

  test("five wrong passwords lock the number, even against the right one", async ({
    request,
  }) => {
    try {
      for (let i = 0; i < 5; i++) {
        const attempt = await request.post("/api/auth/login", {
          data: { phone: PHONES.trialOwner, password: `guess-${i}-xyz` },
        });
        expect(attempt.status()).toBe(401);
      }
      const locked = await request.post("/api/auth/login", {
        data: { phone: PHONES.trialOwner, password: DEMO_PASSWORD },
      });
      expect(locked.status()).toBe(429);
      const body = await locked.json();
      expect(body.error.code).toBe("LOGIN_LOCKED");
      expect(body.error.details.minutes).toBeTruthy();
    } finally {
      await clearRateLimits();
    }
  });

  test("signed in survives a reload; signed out cannot go back", async ({ page }) => {
    await signInWithUi(page, PHONES.smallOwner);
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

  test("the password is changed from the account page, and only the new one works", async ({
    page,
    request,
  }, testInfo) => {
    const phone = PHONES.trialOwner;
    const fresh = `taze${testInfo.project.name.length}${Date.now() % 10_000}x`;
    await signInWithUi(page, phone);
    try {
      await page.goto("/dashboard/account");
      await page.getByLabel("رمز عبور فعلی", { exact: true }).fill(DEMO_PASSWORD);
      await page.getByRole("textbox", { name: /^رمز عبور تازه/ }).fill(fresh);
      await page.getByRole("textbox", { name: "تکرار رمز عبور" }).fill(fresh);
      await page.getByRole("button", { name: "ذخیرهٔ رمز تازه" }).click();
      await expect(page.getByText("رمز عبور تغییر کرد")).toBeVisible();

      await clearRateLimits();
      const old = await request.post("/api/auth/login", {
        data: { phone, password: DEMO_PASSWORD },
      });
      expect(old.status()).toBe(401);
      const renewed = await request.post("/api/auth/login", {
        data: { phone, password: fresh },
      });
      expect(renewed.ok()).toBeTruthy();
    } finally {
      // Back to the fixture's password for every other journey.
      await signInWithApi(page.request, phone, fresh).catch(() => undefined);
      await page.request.post("/api/account/password", {
        data: { currentPassword: fresh, newPassword: DEMO_PASSWORD },
      });
      await clearRateLimits();
    }
    await signInWithApi(page.request, phone);
  });
});

test.describe("an account someone else created activates once with a code", () => {
  test("staff without a password set one with a single SMS code, then sign in", async ({
    page,
  }, testInfo) => {
    const phone = `0939${String(Date.now()).slice(-7)}`;
    const password = `kar${testInfo.project.name.length}mand${Date.now() % 1000}`;
    await signInWithApi(page.request, PHONES.largeOwner);
    const created = await page.request.post("/api/staff", {
      data: { name: "کارمند آزمایشی", phone, tabs: ["analytics"] },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    try {
      // Before activation the account cannot sign in with any password.
      const early = await page.request.post("/api/auth/login", {
        data: { phone, password: DEMO_PASSWORD },
      });
      expect(early.status()).toBe(401);

      await page.context().clearCookies();
      await clearRateLimits();
      await forgetCodes(phone);
      await page.goto("/login/activate");
      await page.getByLabel("شمارهٔ موبایل").fill(phone);
      await page.getByRole("textbox", { name: /^رمز عبور تازه/ }).fill(password);
      await page.getByRole("textbox", { name: "تکرار رمز عبور" }).fill(password);
      await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
      await expect(page.getByLabel("کد تأیید")).toBeVisible();
      await setKnownCode(phone, "LOGIN");
      await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
      await page.waitForURL(/\/dashboard/);

      // From now on: phone and password, no code.
      await page.context().clearCookies();
      await signInWithApi(page.request, phone, password);

      // A second activation is refused: an activation code cannot replace a
      // password, even a correct one — forgetting it is the reset flow's job,
      // with its own code. The request is answered like any other, so it
      // reveals nothing, and no SMS goes out.
      await page.context().clearCookies();
      await clearRateLimits();
      await forgetCodes(phone);
      const asked = await page.request.post("/api/auth/otp", {
        data: { phone, purpose: "ACTIVATE" },
      });
      expect(asked.ok()).toBeTruthy();
      await setKnownCode(phone, "LOGIN");
      const reset = await page.request.post("/api/auth/activate", {
        data: { phone, code: KNOWN_CODE, password: "takeover123" },
      });
      expect(reset.ok()).toBeFalsy();
      await signInWithApi(page.request, phone, password);
    } finally {
      await db.query(`DELETE FROM "User" WHERE phone = $1`, [phone]);
    }
  });
});

test.describe("new owner signs up alone", () => {
  test("sign-up with a code and a password, to a live menu, without help", async ({
    page,
    request,
  }, testInfo) => {
    const errors = watchForErrors(page);
    const suffix = `${Date.now()}`.slice(-7);
    const phone = `0939${suffix}`;
    const slug = `e2e-cafe-${testInfo.project.name}-${suffix}`;
    const password = `zahra${suffix}`;
    await clearRateLimits();

    try {
      await page.goto("/register");
      await page.getByLabel("نام و نام خانوادگی").fill("زهرا تست");
      await page.getByLabel("شمارهٔ موبایل").fill(phone);
      await page.locator("#password").fill(password);
      await page.getByRole("textbox", { name: "تکرار رمز عبور" }).fill(password);
      await page.getByLabel("نام رستوران یا کافه").fill("کافه آزمایشی");
      await page.getByLabel("آدرس منو").fill(slug);
      await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
      await expect(page.getByLabel("کد تأیید")).toBeVisible();
      await setKnownCode(phone, "SIGNUP");

      // A wrong code is refused and the person can try again.
      await page.getByLabel("کد تأیید").fill(KNOWN_CODE.split("").reverse().join(""));
      await expect(page.locator("main").getByRole("alert")).toContainText("درست نیست");
      // The box empties itself after a wrong code; type the right one after that.
      await expect(page.getByLabel("کد تأیید")).toHaveValue("");
      await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
      await page.waitForURL(/\/dashboard/);

      // A brand-new owner is told what to do first, with nothing ticked yet.
      await expect(page.getByText("قدم‌های اول")).toBeVisible();
      await expect(page.locator("main")).toContainText("۰ از ۵ انجام شده");
      const menu = await page.request.get(`/menu/${slug}`);
      expect(menu.status()).toBe(200);

      // The next visit is phone and password.
      const login = await request.post("/api/auth/login", { data: { phone, password } });
      expect(login.ok(), await login.text()).toBeTruthy();
      expect(errors.filter((e) => !e.includes("/api/auth/register"))).toEqual([]);
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

  test("a sign-up code that has expired is refused", async ({ page }) => {
    const suffix = `${Date.now()}`.slice(-7);
    const phone = `0938${suffix}`;
    await clearRateLimits();
    try {
      await page.goto("/register");
      await page.getByLabel("نام و نام خانوادگی").fill("زهرا تست");
      await page.getByLabel("شمارهٔ موبایل").fill(phone);
      await page.locator("#password").fill(`pass${suffix}`);
      await page.getByRole("textbox", { name: "تکرار رمز عبور" }).fill(`pass${suffix}`);
      await page.getByLabel("نام رستوران یا کافه").fill("کافه آزمایشی");
      await page.getByLabel("آدرس منو").fill(`e2e-expired-${suffix}`);
      await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
      await expect(page.getByLabel("کد تأیید")).toBeVisible();
      await setKnownCode(phone, "SIGNUP");
      await db.query(
        `UPDATE "OtpChallenge" SET "expiresAt" = now() - interval '1 minute' WHERE phone = $1`,
        [phone],
      );
      await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
      await expect(page.locator("body")).toContainText(/منقضی|گذشته|دوباره/);
      await expect(page).toHaveURL(/\/register/);
    } finally {
      await forgetCodes(phone);
    }
  });

  test("a taken menu address is explained before any code is sent", async ({ page }) => {
    await clearRateLimits();
    await page.goto("/register");
    await page.getByLabel("نام و نام خانوادگی").fill("زهرا تست");
    await page.getByLabel("شمارهٔ موبایل").fill("09391234567");
    await page.locator("#password").fill("zahra12345");
    await page.getByRole("textbox", { name: "تکرار رمز عبور" }).fill("zahra12345");
    await page.getByLabel("نام رستوران یا کافه").fill("کافه آزمایشی");
    await page.getByLabel("آدرس منو").fill(SLUGS.small);
    await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
    await expect(page.locator("body")).toContainText("این آدرس قبلاً انتخاب شده است");
  });
});

test.describe("a forgotten password", () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("is reset with one texted code, and every other device is signed out", async ({
    page,
    request,
  }, testInfo) => {
    const phone = PHONES.mediumOwner;
    const fresh = `yadam${testInfo.project.name.length}${Date.now() % 10_000}`;
    // A device that stayed signed in with the old password.
    await signInWithApi(request, phone);
    expect((await request.get("/api/staff")).ok()).toBeTruthy();

    try {
      await forgetCodes(phone);
      await page.goto("/login");
      await page.getByRole("link", { name: "رمز عبور را فراموش کرده‌اید؟" }).click();
      await page.waitForURL(/\/login\/reset/);
      await page.getByLabel("شمارهٔ موبایل").fill(phone);
      await page.getByRole("textbox", { name: /^رمز عبور تازه/ }).fill(fresh);
      await page.getByRole("textbox", { name: "تکرار رمز عبور" }).fill(fresh);
      await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
      await expect(page.getByLabel("کد تأیید")).toBeVisible();
      await setKnownCode(phone, "RESET_PASSWORD");
      await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
      await page.waitForURL(/\/dashboard/);

      // The old device is out; the old password no longer opens the account.
      expect((await request.get("/api/staff")).status()).toBe(401);
      const old = await page.request.post("/api/auth/login", {
        data: { phone, password: DEMO_PASSWORD },
      });
      expect(old.status()).toBe(401);
    } finally {
      await clearRateLimits();
      await signInWithApi(page.request, phone, fresh).catch(() => undefined);
      await page.request.post("/api/account/password", {
        data: { currentPassword: fresh, newPassword: DEMO_PASSWORD },
      });
    }
    await signInWithApi(page.request, phone);
  });

  test("is never reset by text for the platform admin", async ({ request }) => {
    await forgetCodes(PHONES.admin);
    // Answered like any other number, so the request reveals nothing…
    const asked = await request.post("/api/auth/otp", {
      data: { phone: PHONES.admin, purpose: "RESET" },
    });
    expect(asked.ok()).toBeTruthy();
    // …but even a correct code does not replace the admin's password.
    await setKnownCode(PHONES.admin, "RESET_PASSWORD");
    const reset = await request.post("/api/auth/reset", {
      data: { phone: PHONES.admin, code: KNOWN_CODE, password: "takeover123" },
    });
    expect(reset.ok()).toBeFalsy();
    await signInWithApi(request, PHONES.admin);
  });

  test("of a branch manager is replaced by the chain owner from the staff page", async ({
    page,
    request,
  }) => {
    const fresh = `shobe${Date.now() % 100_000}`;
    await signInWithApi(page.request, PHONES.chainOwner);
    await page.goto("/dashboard/options/staff");
    const row = page.locator("li", { hasText: PHONES.vanakManager });
    try {
      await row.getByRole("button", { name: "رمز تازه" }).click();
      await row.getByRole("textbox").fill(fresh);
      await row.getByRole("button", { name: "ذخیرهٔ رمز" }).click();
      await expect(page.getByText("رمز تازهٔ آرش زمانی ذخیره شد.")).toBeVisible();
      await signInWithApi(request, PHONES.vanakManager, fresh);

      // Another chain's owner cannot reach this account.
      const manager = await one<{ id: string }>(
        `SELECT id FROM "User" WHERE phone = $1`,
        [PHONES.vanakManager],
      );
      await signInWithApi(request, PHONES.largeOwner);
      const foreign = await request.post(`/api/staff/${manager.id}/password`, {
        data: { password: "notmine123" },
      });
      expect(foreign.status()).toBe(404);
    } finally {
      const manager = await one<{ id: string }>(
        `SELECT id FROM "User" WHERE phone = $1`,
        [PHONES.vanakManager],
      );
      await page.request.post(`/api/staff/${manager.id}/password`, {
        data: { password: DEMO_PASSWORD },
      });
    }
    await signInWithApi(request, PHONES.vanakManager);
  });

  test("of an owner is replaced by platform staff, never by another owner", async ({
    page,
    request,
  }) => {
    const venue = await one<{ id: string }>(
      `SELECT id FROM "Restaurant" WHERE slug = $1`,
      [SLUGS.expired],
    );
    const fresh = `poshtiban${Date.now() % 10_000}`;
    await signInWithApi(request, PHONES.smallOwner);
    const refused = await request.post(
      `/api/admin/restaurants/${venue.id}/owner-password`,
      {
        data: { password: fresh },
      },
    );
    expect(refused.status()).toBe(403);

    await signInWithApi(page.request, PHONES.admin);
    try {
      const set = await page.request.post(
        `/api/admin/restaurants/${venue.id}/owner-password`,
        { data: { password: fresh } },
      );
      expect(set.ok(), await set.text()).toBeTruthy();
      await signInWithApi(request, PHONES.expiredOwner, fresh);
    } finally {
      await page.request.post(`/api/admin/restaurants/${venue.id}/owner-password`, {
        data: { password: DEMO_PASSWORD },
      });
    }
    await signInWithApi(request, PHONES.expiredOwner);
  });
});
