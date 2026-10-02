import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { KNOWN_CODE, clearRateLimits, forgetCodes, setKnownCode } from "./env";

/** Signs in through the login screen, exactly as a person would. */
export async function signInWithUi(page: Page, phone: string): Promise<void> {
  await clearRateLimits();
  await forgetCodes(phone);
  await page.goto("/login");
  await page.getByLabel("شمارهٔ موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  await expect(page.getByLabel("کد تأیید")).toBeVisible();
  await setKnownCode(phone);
  await page.getByLabel("کد تأیید").fill(KNOWN_CODE);
  await page.waitForURL(/\/(dashboard|admin)/);
}

/** The same sign-in through the API — for journeys that are not about sign-in. */
export async function signInWithApi(
  request: APIRequestContext,
  phone: string,
): Promise<void> {
  await clearRateLimits();
  await forgetCodes(phone);
  const sent = await request.post("/api/auth/otp", { data: { phone, purpose: "LOGIN" } });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  await setKnownCode(phone);
  const login = await request.post("/api/auth/login", {
    data: { phone, code: KNOWN_CODE },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
}

/** Collects console errors and failed requests so a journey can assert none happened. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    // A missing favicon is reported by Chrome as an anonymous "Failed to load
    // resource"; resource failures are caught by the response listener below.
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}
